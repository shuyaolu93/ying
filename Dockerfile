FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    RONGHE_HOST=0.0.0.0 \
    RONGHE_PORT=8787

WORKDIR /app
COPY backend /app/backend
RUN mkdir -p /app/backend/data

EXPOSE 8787
CMD ["python", "backend/server.py"]
