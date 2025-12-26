Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # API routes
  namespace :api do
    namespace :v1 do
      resources :feeds do
        member do
          post :refresh
        end
        collection do
          post :refresh_all
        end
      end

      resources :entries, only: [:index, :show, :update] do
        member do
          post :toggle_read
          post :toggle_starred
        end
        collection do
          get :headlines
          post :mark_all_read
        end
        resources :labels, only: [:create, :destroy], controller: "entry_labels"
      end

      resources :labels

      resources :filters do
        member do
          post :test
        end
      end

      resources :categories do
        member do
          patch :reorder
        end
        collection do
          get :tree
        end
      end

      get :counters, to: "counters#index"
      get :search, to: "search#index"

      # Authentication
      scope :auth do
        post :login, to: "sessions#create"
        delete :logout, to: "sessions#destroy"
        get :me, to: "sessions#show"
        post :change_password, to: "sessions#change_password"
      end
    end
  end

  # Defines the root path route ("/")
  root "home#index"
end
