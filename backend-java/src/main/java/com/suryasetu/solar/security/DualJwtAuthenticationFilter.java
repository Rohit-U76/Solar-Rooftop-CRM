package com.suryasetu.solar.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class DualJwtAuthenticationFilter extends OncePerRequestFilter {

  private final JwtTokenService jwtTokenService;
  private final AccessControlService accessControlService;
  private final ObjectMapper objectMapper = new ObjectMapper();

  public DualJwtAuthenticationFilter(
      JwtTokenService jwtTokenService,
      AccessControlService accessControlService
  ) {
    this.jwtTokenService = jwtTokenService;
    this.accessControlService = accessControlService;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String path = request.getServletPath();
    return "OPTIONS".equalsIgnoreCase(request.getMethod())
        || "/api/health".equals(path)
        || path.startsWith("/api/auth/login")
        || path.startsWith("/api/auth/register")
        || path.startsWith("/api/public/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request,
      HttpServletResponse response,
      FilterChain filterChain
  ) throws ServletException, IOException {
    String authHeader = request.getHeader("Authorization");
    if (authHeader == null || !authHeader.startsWith("Bearer ")) {
      writeUnauthorized(response, "Authentication required. Missing Bearer token.");
      return;
    }

    String rawToken = authHeader.substring("Bearer ".length()).trim();
    AuthenticatedPrincipal principal = tryVerifySpringJwt(rawToken);
    if (principal == null) {
      principal = tryVerifyFirebaseToken(rawToken, request.getHeader("X-Workspace-Role"));
    }

    if (principal == null) {
      writeUnauthorized(response, "Invalid or expired authentication token.");
      return;
    }

    String grantedRole = accessControlService.isBootstrappedAdmin(principal)
        ? "ADMIN"
        : principal.role().toUpperCase();

    UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
        principal,
        null,
        List.of(new SimpleGrantedAuthority("ROLE_" + grantedRole))
    );
    SecurityContextHolder.getContext().setAuthentication(authentication);
    filterChain.doFilter(request, response);
  }

  private AuthenticatedPrincipal tryVerifySpringJwt(String token) {
    try {
      return jwtTokenService.parseToken(token);
    } catch (Exception ignored) {
      return null;
    }
  }

  private AuthenticatedPrincipal tryVerifyFirebaseToken(String token, String workspaceRoleHeader) {
    try {
      if (FirebaseApp.getApps().isEmpty()) {
        return null;
      }
      FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(token);
      String role = "SALES_STAFF".equalsIgnoreCase(workspaceRoleHeader)
          ? "SALES_STAFF"
          : "HOMEOWNER";
      Object claimRole = decoded.getClaims().get("role");
      if (claimRole instanceof String s && !s.isBlank()) {
        role = s;
      }
      return new AuthenticatedPrincipal(
          decoded.getUid(),
          decoded.getEmail() != null ? decoded.getEmail() : "",
          decoded.isEmailVerified(),
          role
      );
    } catch (Exception ignored) {
      return null;
    }
  }

  private void writeUnauthorized(HttpServletResponse response, String message) throws IOException {
    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
    response.setContentType("application/json");
    objectMapper.writeValue(response.getWriter(), Map.of("error", message));
  }
}
