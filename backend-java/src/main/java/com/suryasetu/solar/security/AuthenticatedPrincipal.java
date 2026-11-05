package com.suryasetu.solar.security;

public record AuthenticatedPrincipal(
    String uid,
    String email,
    boolean emailVerified,
    String role
) {}
