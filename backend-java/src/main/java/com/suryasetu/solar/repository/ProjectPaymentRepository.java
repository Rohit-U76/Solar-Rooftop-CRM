package com.suryasetu.solar.repository;

import com.suryasetu.solar.entity.ProjectPaymentEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectPaymentRepository extends JpaRepository<ProjectPaymentEntity, String> {
  List<ProjectPaymentEntity> findByProjectIdOrderByCreatedAtDesc(String projectId);
}
