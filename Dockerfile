FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:0.12.17-python3.12-trixie-slim AS deps
ENV UV_LINK_MODE=copy
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

FROM python:3.12-slim
RUN useradd --create-home appuser
WORKDIR /app
COPY --from=deps /app/.venv /app/.venv
COPY backend/ /app/
COPY --from=web /web/dist /app/app/static
RUN mkdir -p /data \
    && chmod +x /app/scripts/entrypoint.sh \
    && chown -R appuser:appuser /data /app
USER appuser
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
