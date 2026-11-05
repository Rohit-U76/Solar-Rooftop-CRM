# Stage 1: Build Spring Boot JAR with Maven + JDK 17
FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests -B

# Stage 2: Minimal Production JRE 17 Runtime
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
COPY --from=build /workspace/target/suryasetu-solar-backend-1.0.0.jar app.jar
RUN mkdir -p /app/.data/bills /app/.data/project_docs
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
