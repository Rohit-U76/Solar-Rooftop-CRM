package com.suryasetu.solar.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class JwtTokenService {

  private final SecretKey secretKey;
  private final long expirationMs;

  public JwtTokenService(
      @Value("${suryasetu.security.jwt-secret}") String secret,
      @Value("${suryasetu.security.jwt-expiration-ms:86400000}") long expirationMs
  ) {
    String padded = secret.length() >= 32
        ? secret
        : (secret + "01234567890123456789012345678901").substring(0, 32);
    this.secretKey = Keys.hmacShaKeyFor(padded.getBytes(StandardCharsets.UTF_8));
    this.expirationMs = expirationMs;
  }

  public String issueToken(String uid, String email, String role, boolean emailVerified) {
    Date now = new Date();
    Date expiry = new Date(now.getTime() + expirationMs);

    return Jwts.builder()
        .subject(uid)
        .claim("email", email)
        .claim("role", role)
        .claim("email_verified", emailVerified)
        .issuedAt(now)
        .expiration(expiry)
        .signWith(secretKey)
        .compact();
  }

  public AuthenticatedPrincipal parseToken(String token) {
    Claims claims = Jwts.parser()
        .verifyWith(secretKey)
        .build()
        .parseSignedClaims(token)
        .getPayload();

    String uid = claims.getSubject();
    String email = claims.get("email", String.class);
    String role = claims.get("role", String.class);
    Boolean verified = claims.get("email_verified", Boolean.class);

    return new AuthenticatedPrincipal(
        uid,
        email != null ? email : "",
        verified == null || verified,
        role != null ? role : "HOMEOWNER"
    );
  }
}
