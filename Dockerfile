FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# Hugging Face Spaces ejecuta el contenedor con el UID 1000
RUN useradd -m -u 1000 user
WORKDIR /app
RUN chown user:user /app
USER user

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

# Las dependencias primero: si solo cambia el codigo, esta capa se reutiliza
COPY --chown=user pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY --chown=user . .

EXPOSE 7860
CMD ["uvicorn", "api_amortization:app", "--host", "0.0.0.0", "--port", "7860"]
