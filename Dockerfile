# syntax=docker/dockerfile:1
# check=error=true

# This Dockerfile is designed for production, not development. Use with Kamal or build'n'run by hand:
# docker build -t ttrb .
# docker run -d -p 80:80 -e RAILS_MASTER_KEY=<value from config/master.key> --name ttrb ttrb

# For a containerized dev environment, see Dev Containers: https://guides.rubyonrails.org/getting_started_with_devcontainer.html

# Make sure RUBY_VERSION matches the Ruby version in .ruby-version
ARG RUBY_VERSION=3.4.13
FROM docker.io/library/ruby:$RUBY_VERSION-slim AS base

# Rails app lives here
WORKDIR /rails

# Install base packages
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y curl libjemalloc2 postgresql-client && \
    ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Set production environment variables and enable jemalloc for reduced memory usage and latency.
ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development" \
    LD_PRELOAD="/usr/local/lib/libjemalloc.so"

# Where the TTS stage puts what lib/tts/generate.py loads at runtime. The final
# stage copies each to the same path: the venv's bin/python3 is a symlink into
# UV_PYTHON_INSTALL_DIR, and torch hub / NLTK would otherwise download their
# models into a home directory that every new container starts without.
ENV UV_PYTHON_INSTALL_DIR="/opt/uv-python" \
    TORCH_HOME="/opt/tts-cache/torch" \
    NLTK_DATA="/opt/tts-cache/nltk_data"

# Text-to-speech toolchain for TtsGenerator: Piper for synthesis, forcealign
# (wav2vec2 on torch) for word timestamps. uv supplies Python 3.12 because
# trixie's python3 is 3.13 and pyproject.toml requires <3.13. The CPU torch
# backend keeps the CUDA wheels out; the host venv with them is 6.8G.
FROM base AS tts

COPY --from=ghcr.io/astral-sh/uv:0.12.22 /uv /usr/local/bin/uv

ENV UV_LINK_MODE="copy" \
    UV_PYTHON_PREFERENCE="only-managed"

RUN uv python install 3.12 && \
    uv venv --python 3.12 /rails/.venv && \
    uv pip install --no-cache --python /rails/.venv/bin/python3 --torch-backend cpu \
      torch==2.9.1 torchaudio==2.9.1 torchcodec==0.9.1 \
      piper-tts==1.3.0 forcealign==1.1.9

# Models fetched on first use, baked in so generation works offline.
RUN /rails/.venv/bin/python3 -m nltk.downloader -q -d "${NLTK_DATA}" \
      averaged_perceptron_tagger averaged_perceptron_tagger_eng cmudict && \
    /rails/.venv/bin/python3 -c "import torchaudio; torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H.get_model()" && \
    chmod -R a+rX /opt/tts-cache

# Piper voice. The .onnx is gitignored, and Kamal builds from a git clone, so
# it cannot come from the build context.
ARG PIPER_VOICES=https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium
ADD --chmod=644 --checksum=sha256:5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f \
    ${PIPER_VOICES}/en_US-lessac-medium.onnx /rails/lib/tts/models/en_US-lessac-medium.onnx
ADD --chmod=644 --checksum=sha256:efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0 \
    ${PIPER_VOICES}/en_US-lessac-medium.onnx.json /rails/lib/tts/models/en_US-lessac-medium.onnx.json

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build gems and node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential git libpq-dev libyaml-dev node-gyp pkg-config python-is-python3 && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Install JavaScript dependencies
ARG NODE_VERSION=25.4.0
ENV PATH=/usr/local/node/bin:$PATH
RUN curl -sL https://github.com/nodenv/node-build/archive/master.tar.gz | tar xz -C /tmp/ && \
    /tmp/node-build-master/bin/node-build "${NODE_VERSION}" /usr/local/node && \
    rm -rf /tmp/node-build-master

# Install application gems
COPY Gemfile Gemfile.lock vendor ./

RUN bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    # -j 1 disable parallel compilation to avoid a QEMU bug: https://github.com/rails/bootsnap/issues/495
    bundle exec bootsnap precompile -j 1 --gemfile

# Install node modules
COPY package.json package-lock.json ./
RUN npm ci

# Copy application code
COPY . .

# Precompile bootsnap code for faster boot times.
# -j 1 disable parallel compilation to avoid a QEMU bug: https://github.com/rails/bootsnap/issues/495
RUN bundle exec bootsnap precompile -j 1 app/ lib/

# Precompiling assets for production without requiring secret RAILS_MASTER_KEY
RUN SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile


RUN rm -rf node_modules


# Final stage for app image
FROM base

# lib/tts/generate.py runs the ffmpeg CLI to pad the audio, and torchcodec
# (torchaudio.load) links against the FFmpeg shared libraries.
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y ffmpeg && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Run and own only the runtime files as a non-root user for security
RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash
USER 1000:1000

# Copy built artifacts: gems, application
COPY --chown=rails:rails --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --chown=rails:rails --from=build /rails /rails

# TTS toolchain, read-only at runtime. Same paths as in the tts stage.
COPY --from=tts /opt /opt
COPY --from=tts /rails/.venv /rails/.venv
COPY --from=tts /rails/lib/tts/models /rails/lib/tts/models

# On-disk cache directories. .dockerignore keeps the build context copies out,
# so create them here owned by the app user (USER is already 1000:1000): the
# Kamal volume mounted at each path inherits that ownership on first mount,
# which is what lets FetchFaviconJob, ImageCacher and TtsGenerator write there.
RUN mkdir -p /rails/public/icons \
             /rails/public/images/cache \
             /rails/public/audio/cache

# Entrypoint prepares the database.
ENTRYPOINT ["/rails/bin/docker-entrypoint"]

# Start server via Thruster by default, this can be overwritten at runtime
EXPOSE 80
CMD ["./bin/thrust", "./bin/rails", "server"]
