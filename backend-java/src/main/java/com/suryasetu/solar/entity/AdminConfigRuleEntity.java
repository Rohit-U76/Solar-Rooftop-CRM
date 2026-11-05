package com.suryasetu.solar.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "admin_config_rules")
public class AdminConfigRuleEntity {

  @Id
  @Column(length = 80)
  private String id;

  @Column(name = "rule_category", nullable = false, length = 32)
  private String ruleCategory;

  @Column(name = "workspace_scope", nullable = false, length = 64)
  private String workspaceScope = "global";

  @Column(nullable = false, length = 160)
  private String title;

  @Column(nullable = false, length = 64)
  private String code;

  @Column(name = "version_number", nullable = false)
  private int versionNumber;

  @Column(name = "effective_from", nullable = false, length = 16)
  private String effectiveFrom;

  @Column(name = "effective_to", nullable = false, length = 16)
  private String effectiveTo;

  @Column(name = "is_active", nullable = false)
  private boolean active = true;

  @Column(name = "parameters_json", nullable = false, columnDefinition = "TEXT")
  private String parametersJson;

  @Column(length = 500)
  private String notes;

  @Column(name = "created_by_uid", nullable = false, length = 128)
  private String createdByUid;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @PrePersist
  public void onCreate() {
    Instant now = Instant.now();
    if (createdAt == null) createdAt = now;
    updatedAt = now;
  }

  @PreUpdate
  public void onUpdate() {
    updatedAt = Instant.now();
  }

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getRuleCategory() { return ruleCategory; }
  public void setRuleCategory(String ruleCategory) { this.ruleCategory = ruleCategory; }
  public String getWorkspaceScope() { return workspaceScope; }
  public void setWorkspaceScope(String workspaceScope) { this.workspaceScope = workspaceScope; }
  public String getTitle() { return title; }
  public void setTitle(String title) { this.title = title; }
  public String getCode() { return code; }
  public void setCode(String code) { this.code = code; }
  public int getVersionNumber() { return versionNumber; }
  public void setVersionNumber(int versionNumber) { this.versionNumber = versionNumber; }
  public String getEffectiveFrom() { return effectiveFrom; }
  public void setEffectiveFrom(String effectiveFrom) { this.effectiveFrom = effectiveFrom; }
  public String getEffectiveTo() { return effectiveTo; }
  public void setEffectiveTo(String effectiveTo) { this.effectiveTo = effectiveTo; }
  public boolean isActive() { return active; }
  public void setActive(boolean active) { this.active = active; }
  public String getParametersJson() { return parametersJson; }
  public void setParametersJson(String parametersJson) { this.parametersJson = parametersJson; }
  public String getNotes() { return notes; }
  public void setNotes(String notes) { this.notes = notes; }
  public String getCreatedByUid() { return createdByUid; }
  public void setCreatedByUid(String createdByUid) { this.createdByUid = createdByUid; }
  public Instant getCreatedAt() { return createdAt; }
  public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
