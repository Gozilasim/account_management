# Created at: 2026-05-13 23:14
# Updated at: 2026-05-13 23:14
# Description: Make targets for server Docker Compose operations.

# ###############################################
# Variables
# ###############################################

SERVER_ENV=.env.server
SERVER_COMPOSE=docker-compose.server.yml
DOCKER_COMPOSE=docker compose --env-file $(SERVER_ENV) -f $(SERVER_COMPOSE)

# ###############################################
# Targets
# ###############################################

.PHONY: server server-config server-logs server-down

server:
	$(DOCKER_COMPOSE) up --build -d

server-config:
	$(DOCKER_COMPOSE) config

server-logs:
	$(DOCKER_COMPOSE) logs -f backend

server-down:
	$(DOCKER_COMPOSE) down
