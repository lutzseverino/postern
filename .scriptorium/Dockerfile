FROM node:24-bookworm

RUN npm install --global pnpm@11.28.8 --ignore-scripts

# The factory creates this user and home in its agent layer.
ENV pnpm_config_store_dir=/home/agent/.local/share/pnpm/store
