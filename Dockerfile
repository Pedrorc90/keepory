# syntax=docker/dockerfile:1

# --- Stage 1: Angular bundle -------------------------------------------------
FROM node:22-alpine AS ui
WORKDIR /ui
COPY keepory-ui/package.json keepory-ui/package-lock.json ./
RUN npm ci
COPY keepory-ui/ ./
RUN npm run build

# --- Stage 2: Spring Boot jar, with the bundle inside ------------------------
FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /build
COPY keepory-backend/pom.xml ./
RUN mvn -B -q dependency:go-offline
COPY keepory-backend/src ./src
COPY --from=ui /ui/dist/keepory-ui/browser ./src/main/resources/static
RUN mvn -B -q clean package -DskipTests

# --- Stage 3: runtime, with a CDS archive to cut cold starts -----------------
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app
COPY --from=backend /build/target/*.jar app.jar
RUN java -Djarmode=tools -jar app.jar extract --destination extracted && rm app.jar

# Training run: refresh the context and exit, recording the loaded classes.
# The database is not reachable at build time, so anything that would open a
# connection during refresh stays off.
RUN java -XX:ArchiveClassesAtExit=/app/app.jsa \
      -Dspring.context.exit=onRefresh \
      -Dspring.flyway.enabled=false \
      -Dspring.jpa.hibernate.ddl-auto=none \
      -Dspring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect \
      -jar /app/extracted/app.jar

EXPOSE 8080
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:SharedArchiveFile=/app/app.jsa -Xshare:auto"
CMD ["sh", "-c", "exec java $JAVA_OPTS -jar /app/extracted/app.jar"]
