-- =============================================================================
-- SuryaSetu Solar CRM — MySQL 8.x Relational Schema Reference
-- Note: Hibernate automatically creates/updates these tables via ddl-auto=update
-- =============================================================================

CREATE DATABASE IF NOT EXISTS suryasetu_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE suryasetu_db;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(160) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(24) NOT NULL DEFAULT 'HOMEOWNER',
  preferred_language VARCHAR(8) NOT NULL DEFAULT 'en',
  email_verified BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL
);

CREATE TABLE IF NOT EXISTS solar_leads (
  id VARCHAR(64) PRIMARY KEY,
  lead_number VARCHAR(32) NOT NULL UNIQUE,
  owner_uid VARCHAR(128) NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  mobile_number VARCHAR(20) NOT NULL,
  email VARCHAR(160),
  dpdp_consent BOOLEAN NOT NULL DEFAULT TRUE,
  ownership_type VARCHAR(16) NOT NULL,
  roof_type VARCHAR(24) NOT NULL,
  rooftop_area_sq_ft DOUBLE NOT NULL,
  avg_monthly_bill_inr DOUBLE NOT NULL,
  average_units_kwh DOUBLE NOT NULL DEFAULT 0,
  sanctioned_load_kw DOUBLE NOT NULL DEFAULT 0,
  pincode VARCHAR(10) NOT NULL,
  city VARCHAR(80) NOT NULL,
  qualification_category VARCHAR(16) NOT NULL,
  lead_score INT NOT NULL,
  recommended_capacity_kw DOUBLE NOT NULL,
  recommendation_label VARCHAR(64) NOT NULL,
  recommendation_reason VARCHAR(1000),
  next_recommended_action VARCHAR(500),
  survey_status VARCHAR(32) NOT NULL,
  lead_stage VARCHAR(32) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX idx_solar_leads_owner (owner_uid),
  INDEX idx_solar_leads_pincode (pincode),
  INDEX idx_solar_leads_category (qualification_category)
);

CREATE TABLE IF NOT EXISTS electricity_bills (
  storage_key VARCHAR(80) PRIMARY KEY,
  lead_id VARCHAR(64),
  owner_uid VARCHAR(128) NOT NULL,
  file_name VARCHAR(160) NOT NULL,
  mime_type VARCHAR(40) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  storage_ref VARCHAR(120) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  INDEX idx_bills_owner (owner_uid)
);

CREATE TABLE IF NOT EXISTS bill_extractions (
  id VARCHAR(64) PRIMARY KEY,
  lead_id VARCHAR(64),
  storage_ref VARCHAR(140) NOT NULL,
  owner_uid VARCHAR(128) NOT NULL,
  consumer_number VARCHAR(64) NOT NULL,
  discom_name VARCHAR(120) NOT NULL,
  tariff_category VARCHAR(80) NOT NULL,
  sanctioned_load_kw DOUBLE NOT NULL,
  monthly_units_kwh DOUBLE NOT NULL,
  billing_amount_inr DOUBLE NOT NULL,
  billing_period VARCHAR(80) NOT NULL,
  confidence_score INT NOT NULL,
  clarity_status VARCHAR(32) NOT NULL,
  verification_status VARCHAR(32) NOT NULL,
  extraction_notes VARCHAR(650),
  verified_by_uid VARCHAR(128),
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_config_rules (
  id VARCHAR(80) PRIMARY KEY,
  rule_category VARCHAR(32) NOT NULL,
  workspace_scope VARCHAR(64) NOT NULL DEFAULT 'global',
  title VARCHAR(160) NOT NULL,
  code VARCHAR(64) NOT NULL,
  version_number INT NOT NULL,
  effective_from VARCHAR(16) NOT NULL,
  effective_to VARCHAR(16) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  parameters_json TEXT NOT NULL,
  notes VARCHAR(500),
  created_by_uid VARCHAR(128) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX idx_rules_category_code (rule_category, code)
);

CREATE TABLE IF NOT EXISTS solar_quotations (
  id VARCHAR(64) PRIMARY KEY,
  quotation_number VARCHAR(40) NOT NULL UNIQUE,
  lead_id VARCHAR(64) NOT NULL,
  owner_uid VARCHAR(128) NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  city VARCHAR(80) NOT NULL,
  pincode VARCHAR(10) NOT NULL,
  ownership_type VARCHAR(16) NOT NULL,
  system_capacity_kw DOUBLE NOT NULL,
  panel_type_label VARCHAR(160) NOT NULL,
  annual_generation_units INT NOT NULL,
  equipment_cost_inr INT NOT NULL,
  installation_charges_inr INT NOT NULL,
  total_installation_cost_inr INT NOT NULL,
  applicable_subsidy_inr INT NOT NULL,
  net_customer_cost_inr INT NOT NULL,
  electricity_tariff_inr DOUBLE NOT NULL,
  self_consumption_units INT NOT NULL,
  estimated_annual_savings_inr INT NOT NULL,
  estimated_payback_years DOUBLE NOT NULL,
  quotation_date VARCHAR(16) NOT NULL,
  valid_until_date VARCHAR(16) NOT NULL,
  applied_rule_snapshot_json TEXT NOT NULL,
  status VARCHAR(24) NOT NULL,
  created_by_uid VARCHAR(128) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX idx_quotations_owner (owner_uid),
  INDEX idx_quotations_lead (lead_id)
);

CREATE TABLE IF NOT EXISTS solar_projects (
  id VARCHAR(64) PRIMARY KEY,
  project_number VARCHAR(40) NOT NULL UNIQUE,
  quotation_id VARCHAR(64) NOT NULL,
  lead_id VARCHAR(64) NOT NULL,
  owner_uid VARCHAR(128) NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  city VARCHAR(80) NOT NULL,
  pincode VARCHAR(10) NOT NULL,
  system_capacity_kw DOUBLE NOT NULL,
  net_customer_cost_inr INT NOT NULL,
  applicable_subsidy_inr INT NOT NULL,
  current_stage VARCHAR(40) NOT NULL,
  stage_index INT NOT NULL,
  pending_activities VARCHAR(500),
  is_delayed BOOLEAN NOT NULL DEFAULT FALSE,
  delay_reason VARCHAR(500),
  tracking_token VARCHAR(80) NOT NULL UNIQUE,
  stage_started_at VARCHAR(32) NOT NULL,
  updated_by_name VARCHAR(120),
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX idx_projects_owner (owner_uid),
  INDEX idx_projects_token (tracking_token)
);

CREATE TABLE IF NOT EXISTS project_documents (
  doc_id VARCHAR(80) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  owner_uid VARCHAR(128) NOT NULL,
  assigned_staff_uids_csv VARCHAR(600),
  uploaded_by_uid VARCHAR(128) NOT NULL,
  uploaded_by_name VARCHAR(120) NOT NULL,
  doc_type VARCHAR(48),
  file_name VARCHAR(160) NOT NULL,
  mime_type VARCHAR(48) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  notes VARCHAR(500),
  created_at DATETIME(6) NOT NULL,
  INDEX idx_project_docs_project (project_id)
);

CREATE TABLE IF NOT EXISTS project_payments (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  owner_uid VARCHAR(128) NOT NULL,
  payment_reference VARCHAR(64) NOT NULL,
  milestone VARCHAR(40) NOT NULL,
  amount_inr INT NOT NULL,
  payment_mode VARCHAR(32) NOT NULL,
  is_simulation BOOLEAN NOT NULL DEFAULT TRUE,
  recorded_by_uid VARCHAR(128) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  INDEX idx_project_payments_project (project_id)
);
