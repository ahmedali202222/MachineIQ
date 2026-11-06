# All-in-one demo image: simulator + PostgreSQL + backend + dashboard in one container.
# Used for the free public demo (one web service). For real use, run docker-compose.yml instead.

FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /src
COPY backend/pom.xml .
RUN mvn -B -q dependency:go-offline
COPY backend/src ./src
RUN mvn -B -q package -DskipTests

FROM eclipse-temurin:21-jre
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY simulator/requirements.txt simulator/machine_model.py simulator/server.py ./simulator/
RUN python3 -m venv /app/venv && /app/venv/bin/pip install --no-cache-dir -r simulator/requirements.txt
COPY --from=backend /src/target/machineiq-backend-*.jar app.jar
COPY --from=frontend /app/dist ./static
COPY deploy/start.sh .
RUN chmod +x start.sh
ENV PORT=8080
EXPOSE 8080
CMD ["/app/start.sh"]
