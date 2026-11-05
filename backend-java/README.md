# SuryaSetu Solar — Java 17 + Spring Boot 3 + MySQL Backend

This folder contains the complete **Java 17 + Spring Boot 3.4 + Spring Security + JWT + Spring Data JPA + MySQL** backend for **SuryaSetu** (Nagpur & Vidarbha Rooftop Solar Lead Qualification, Quotation & EPC Project Management).

---

## 1. Quick Start with Docker Compose (MySQL 8.4 + Spring Boot)

```bash
cd backend-java
GEMINI_API_KEY="your_gemini_api_key" docker compose up --build
```

- **MySQL 8.4**: `localhost:3306` (`suryasetu_db`)
- **Spring Boot API**: `http://localhost:8080`
- **Health Check**: `GET http://localhost:8080/api/health`

---

## 2. Running Locally with Maven & Local MySQL

1. Ensure **Java 17+**, **Maven 3.9+**, and **MySQL 8+** are installed.
2. Set environment variables and start Spring Boot:

```bash
cd backend-java
export SPRING_DATASOURCE_URL="jdbc:mysql://localhost:3306/suryasetu_db?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Kolkata"
export SPRING_DATASOURCE_USERNAME="root"
export SPRING_DATASOURCE_PASSWORD="your_mysql_password"
export GEMINI_API_KEY="your_gemini_api_key"
mvn spring-boot:run
```

On first boot, Hibernate automatically provisions all MySQL tables (`ddl-auto: update`) and `DataInitializer` seeds default Vidarbha solar hardware options, 1,400 units/kW generation pricing rules, MSEDCL LT-I tariffs, and residential subsidy slabs.

---

## 3. Connecting the React + Vite Frontend (`VITE_API_BASE_URL`)

In the project root `.env` (or terminal environment when running Vite):

```env
VITE_API_BASE_URL="http://localhost:8080"
```

- When `VITE_API_BASE_URL` is set to `http://localhost:8080`, `src/lib/apiClient.ts` routes all `/api/*` requests directly to the Spring Boot + MySQL server.
- When `VITE_API_BASE_URL` is empty (`""`), the React frontend uses same-origin `/api/*` so the hosted preview works seamlessly out of the box.

---

## 4. Dual Authentication & RBAC

`DualJwtAuthenticationFilter` accepts Bearer tokens from **both**:
1. **Native Spring Security HS256 JWTs** issued by `POST /api/auth/register` and `POST /api/auth/login` (stored in MySQL `users` with BCrypt password hashing).
2. **Firebase Authentication ID Tokens** from the React frontend (`com.google.firebase:firebase-admin`), enforcing `HOMEOWNER`, `SALES_STAFF`, and `ADMIN` role-based access control.
