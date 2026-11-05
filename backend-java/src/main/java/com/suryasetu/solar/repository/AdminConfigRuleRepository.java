package com.suryasetu.solar.repository;

import com.suryasetu.solar.entity.AdminConfigRuleEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AdminConfigRuleRepository extends JpaRepository<AdminConfigRuleEntity, String> {
  List<AdminConfigRuleEntity> findAllByOrderByCodeAscVersionNumberDesc();
}
