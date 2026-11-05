package com.suryasetu.solar.controller;

import com.suryasetu.solar.dto.ApiDtos.AuthResponse;
import com.suryasetu.solar.dto.ApiDtos.LoginRequest;
import com.suryasetu.solar.dto.ApiDtos.RegisterRequest;
import com.suryasetu.solar.entity.UserEntity;
import com.suryasetu.solar.repository.UserRepository;
import com.suryasetu.solar.security.AuthenticatedPrincipal;
import com.suryasetu.solar.security.JwtTokenService;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HealthAndAuthController {

  private final UserRepository userRepository;
  private final PasswordEncoder passwordEncoder;
  private final JwtTokenService jwtTokenService;

  public HealthAndAuthController(
      UserRepository userRepository,
      PasswordEncoder passwordEncoder,
      JwtTokenService jwtTokenService
  ) {
    this.userRepository = userRepository;
    this.passwordEncoder = passwordEncoder;
    this.jwtTokenService = jwtTokenService;
  }

  @GetMapping("/health")
  public Map<String, Object> health() {
    return Map.of(
        "ok", true,
        "region", "Vidarbha-Nagpur",
        "backend", "spring-boot-mysql"
    );
  }

  @PostMapping("/auth/register")
  public ResponseEntity<?> register(@RequestBody RegisterRequest request) {
    if (request.email() == null || !request.email().contains("@")
        || request.password() == null || request.password().length() < 6) {
      return ResponseEntity.badRequest().body(Map.of(
          "error", "Valid email and password (minimum 6 characters) are required."
      ));
    }

    String cleanEmail = request.email().trim().toLowerCase();
    if (userRepository.existsByEmailIgnoreCase(cleanEmail)) {
      return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
          "error", "An account with this email address already exists."
      ));
    }

    String requestedRole = request.role() != null ? request.role().trim().toUpperCase() : "HOMEOWNER";
    String assignedRole = Set.of("HOMEOWNER", "SALES_STAFF").contains(requestedRole)
        ? requestedRole
        : "HOMEOWNER";

    UserEntity user = new UserEntity();
    user.setId("usr_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20));
    user.setEmail(cleanEmail);
    user.setDisplayName(
        request.displayName() != null && !request.displayName().isBlank()
            ? request.displayName().trim()
            : cleanEmail.split("@")[0]
    );
    user.setPasswordHash(passwordEncoder.encode(request.password()));
    user.setRole(assignedRole);
    user.setEmailVerified(true);

    userRepository.save(user);

    String jwt = jwtTokenService.issueToken(
        user.getId(), user.getEmail(), user.getRole(), user.isEmailVerified()
    );
    return ResponseEntity.status(HttpStatus.CREATED).body(new AuthResponse(
        jwt, user.getId(), user.getEmail(), user.getDisplayName(), user.getRole()
    ));
  }

  @PostMapping("/auth/login")
  public ResponseEntity<?> login(@RequestBody LoginRequest request) {
    if (request.email() == null || request.password() == null) {
      return ResponseEntity.badRequest().body(Map.of("error", "Email and password are required."));
    }

    return userRepository.findByEmailIgnoreCase(request.email().trim())
        .filter(u -> passwordEncoder.matches(request.password(), u.getPasswordHash()))
        .<ResponseEntity<?>>map(u -> {
          String jwt = jwtTokenService.issueToken(
              u.getId(), u.getEmail(), u.getRole(), u.isEmailVerified()
          );
          return ResponseEntity.ok(new AuthResponse(
              jwt, u.getId(), u.getEmail(), u.getDisplayName(), u.getRole()
          ));
        })
        .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of("error", "Invalid email or password.")));
  }

  @GetMapping("/auth/me")
  public ResponseEntity<?> currentUser(@AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return ResponseEntity.ok(Map.of(
        "uid", principal.uid(),
        "email", principal.email(),
        "emailVerified", principal.emailVerified(),
        "role", principal.role()
    ));
  }
}
