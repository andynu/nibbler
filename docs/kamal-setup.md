# Kamal Deploy Setup

## Prerequisites

### Docker Buildx

Install the buildx plugin:

```bash
sudo apt install docker-buildx
```

### Insecure Registry (for local/private registries over HTTP)

If using an HTTP registry (not HTTPS), configure both Docker daemon and buildx.

**1. Docker daemon** - Edit `/etc/docker/daemon.json`:

```json
{
  "insecure-registries": ["192.168.1.208:5555"]
}
```

Then restart Docker:

```bash
sudo systemctl restart docker
```

**2. Buildx/BuildKit** - Create `~/.config/buildkit/buildkitd.toml`:

```toml
[registry."192.168.1.208:5555"]
  http = true
  insecure = true
```

Then recreate the Kamal builder:

```bash
docker buildx rm kamal-local-docker-container
docker buildx create --name kamal-local-docker-container --driver=docker-container --config ~/.config/buildkit/buildkitd.toml
```

## Secrets

Kamal reads secrets from `.kamal/secrets`. Create this file with required secrets:

```bash
# .kamal/secrets (not committed to git)
SECRET_KEY_BASE=<generate with `rails secret`>
POSTGRES_PASSWORD=<your db password>
```

Generate a secret key:

```bash
rails secret
```

## Deploying

```bash
kamal deploy
```
