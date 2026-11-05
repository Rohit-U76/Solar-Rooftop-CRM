package com.suryasetu.solar.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "solar_quotations")
public class SolarQuotationEntity {

  @Id
  @Column(length = 64)
  private String id;

  @Column(name = "quotation_number", nullable = false, unique = true, length = 40)
  private String quotationNumber;

  @Column(name = "lead_id", nullable = false, length = 64)
  private String leadId;

  @Column(name = "owner_uid", nullable = false, length = 128)
  private String ownerUid;

  @Column(name = "customer_name", nullable = false, length = 120)
  private String customerName;

  @Column(nullable = false, length = 80)
  private String city;

  @Column(nullable = false, length = 10)
  private String pincode;

  @Column(name = "ownership_type", nullable = false, length = 16)
  private String ownershipType;

  @Column(name = "system_capacity_kw", nullable = false)
  private double systemCapacityKw;

  @Column(name = "panel_type_label", nullable = false, length = 160)
  private String panelTypeLabel;

  @Column(name = "annual_generation_units", nullable = false)
  private int annualGenerationUnits;

  @Column(name = "equipment_cost_inr", nullable = false)
  private int equipmentCostInr;

  @Column(name = "installation_charges_inr", nullable = false)
  private int installationChargesInr;

  @Column(name = "total_installation_cost_inr", nullable = false)
  private int totalInstallationCostInr;

  @Column(name = "applicable_subsidy_inr", nullable = false)
  private int applicableSubsidyInr;

  @Column(name = "net_customer_cost_inr", nullable = false)
  private int netCustomerCostInr;

  @Column(name = "electricity_tariff_inr", nullable = false)
  private double electricityTariffInr;

  @Column(name = "self_consumption_units", nullable = false)
  private int selfConsumptionUnits;

  @Column(name = "estimated_annual_savings_inr", nullable = false)
  private int estimatedAnnualSavingsInr;

  @Column(name = "estimated_payback_years", nullable = false)
  private double estimatedPaybackYears;

  @Column(name = "quotation_date", nullable = false, length = 16)
  private String quotationDate;

  @Column(name = "valid_until_date", nullable = false, length = 16)
  private String validUntilDate;

  @Column(name = "applied_rule_snapshot_json", nullable = false, columnDefinition = "TEXT")
  private String appliedRuleSnapshotJson;

  @Column(nullable = false, length = 24)
  private String status;

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
  public String getQuotationNumber() { return quotationNumber; }
  public void setQuotationNumber(String quotationNumber) { this.quotationNumber = quotationNumber; }
  public String getLeadId() { return leadId; }
  public void setLeadId(String leadId) { this.leadId = leadId; }
  public String getOwnerUid() { return ownerUid; }
  public void setOwnerUid(String ownerUid) { this.ownerUid = ownerUid; }
  public String getCustomerName() { return customerName; }
  public void setCustomerName(String customerName) { this.customerName = customerName; }
  public String getCity() { return city; }
  public void setCity(String city) { this.city = city; }
  public String getPincode() { return pincode; }
  public void setPincode(String pincode) { this.pincode = pincode; }
  public String getOwnershipType() { return ownershipType; }
  public void setOwnershipType(String ownershipType) { this.ownershipType = ownershipType; }
  public double getSystemCapacityKw() { return systemCapacityKw; }
  public void setSystemCapacityKw(double systemCapacityKw) { this.systemCapacityKw = systemCapacityKw; }
  public String getPanelTypeLabel() { return panelTypeLabel; }
  public void setPanelTypeLabel(String panelTypeLabel) { this.panelTypeLabel = panelTypeLabel; }
  public int getAnnualGenerationUnits() { return annualGenerationUnits; }
  public void setAnnualGenerationUnits(int annualGenerationUnits) { this.annualGenerationUnits = annualGenerationUnits; }
  public int getEquipmentCostInr() { return equipmentCostInr; }
  public void setEquipmentCostInr(int equipmentCostInr) { this.equipmentCostInr = equipmentCostInr; }
  public int getInstallationChargesInr() { return installationChargesInr; }
  public void setInstallationChargesInr(int installationChargesInr) { this.installationChargesInr = installationChargesInr; }
  public int getTotalInstallationCostInr() { return totalInstallationCostInr; }
  public void setTotalInstallationCostInr(int totalInstallationCostInr) { this.totalInstallationCostInr = totalInstallationCostInr; }
  public int getApplicableSubsidyInr() { return applicableSubsidyInr; }
  public void setApplicableSubsidyInr(int applicableSubsidyInr) { this.applicableSubsidyInr = applicableSubsidyInr; }
  public int getNetCustomerCostInr() { return netCustomerCostInr; }
  public void setNetCustomerCostInr(int netCustomerCostInr) { this.netCustomerCostInr = netCustomerCostInr; }
  public double getElectricityTariffInr() { return electricityTariffInr; }
  public void setElectricityTariffInr(double electricityTariffInr) { this.electricityTariffInr = electricityTariffInr; }
  public int getSelfConsumptionUnits() { return selfConsumptionUnits; }
  public void setSelfConsumptionUnits(int selfConsumptionUnits) { this.selfConsumptionUnits = selfConsumptionUnits; }
  public int getEstimatedAnnualSavingsInr() { return estimatedAnnualSavingsInr; }
  public void setEstimatedAnnualSavingsInr(int estimatedAnnualSavingsInr) { this.estimatedAnnualSavingsInr = estimatedAnnualSavingsInr; }
  public double getEstimatedPaybackYears() { return estimatedPaybackYears; }
  public void setEstimatedPaybackYears(double estimatedPaybackYears) { this.estimatedPaybackYears = estimatedPaybackYears; }
  public String getQuotationDate() { return quotationDate; }
  public void setQuotationDate(String quotationDate) { this.quotationDate = quotationDate; }
  public String getValidUntilDate() { return validUntilDate; }
  public void setValidUntilDate(String validUntilDate) { this.validUntilDate = validUntilDate; }
  public String getAppliedRuleSnapshotJson() { return appliedRuleSnapshotJson; }
  public void setAppliedRuleSnapshotJson(String appliedRuleSnapshotJson) { this.appliedRuleSnapshotJson = appliedRuleSnapshotJson; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getCreatedByUid() { return createdByUid; }
  public void setCreatedByUid(String createdByUid) { this.createdByUid = createdByUid; }
  public Instant getCreatedAt() { return createdAt; }
  public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
