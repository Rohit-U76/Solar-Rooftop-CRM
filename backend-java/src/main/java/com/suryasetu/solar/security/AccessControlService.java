package com.suryasetu.solar.security;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class AccessControlService {

  private final String bootstrappedAdminEmail;

  public AccessControlService(
      @Value("${suryasetu.security.bootstrapped-admin-email:rohitumdale@gmail.com}")
      String bootstrappedAdminEmail
  ) {
    this.bootstrappedAdminEmail = bootstrappedAdminEmail;
  }

  public record AccessDecision(boolean allowed, String reason) {}

  public boolean isBootstrappedAdmin(AuthenticatedPrincipal principal) {
    return principal != null
        && principal.emailVerified()
        && principal.email() != null
        && principal.email().equalsIgnoreCase(bootstrappedAdminEmail);
  }

  public AccessDecision checkAdminAccess(AuthenticatedPrincipal principal) {
    if (principal == null || principal.uid() == null || principal.uid().isBlank()) {
      return new AccessDecision(false, "Authentication required.");
    }
    if (!principal.emailVerified()) {
      return new AccessDecision(false, "Verified email token is required.");
    }
    if (isBootstrappedAdmin(principal) || "ADMIN".equalsIgnoreCase(principal.role())) {
      return new AccessDecision(true, null);
    }
    return new AccessDecision(
        false,
        "Administrator privileges required to modify pricing or subsidy rules."
    );
  }

  public AccessDecision verifyResourceAccess(
      AuthenticatedPrincipal principal,
      String workspaceRoleHeader,
      String resourceOwnerUid,
      List<String> assignedStaffUids,
      boolean requireStaff
  ) {
    if (principal == null || principal.uid() == null || principal.uid().isBlank()) {
      return new AccessDecision(false, "Authentication required.");
    }
    if (!principal.emailVerified()) {
      return new AccessDecision(false, "Verified email token is required.");
    }

    String effectiveRole = principal.role();
    if ("SALES_STAFF".equalsIgnoreCase(workspaceRoleHeader)
        && !"ADMIN".equalsIgnoreCase(effectiveRole)) {
      effectiveRole = "SALES_STAFF";
    }

    boolean isStaffOrAdmin = isBootstrappedAdmin(principal)
        || "ADMIN".equalsIgnoreCase(effectiveRole)
        || "SALES_STAFF".equalsIgnoreCase(effectiveRole)
        || (assignedStaffUids != null && assignedStaffUids.contains(principal.uid()));

    if (requireStaff && !isStaffOrAdmin) {
      return new AccessDecision(false, "Sales Staff or Administrator authorization required.");
    }

    if (resourceOwnerUid != null && !resourceOwnerUid.isBlank()) {
      if (resourceOwnerUid.equals(principal.uid()) || isStaffOrAdmin) {
        return new AccessDecision(true, null);
      }
      return new AccessDecision(
          false,
          "Access restricted to document owner or assigned sales team."
      );
    }

    return new AccessDecision(true, null);
  }
}
