package com.suryasetu.solar.repository;

import com.suryasetu.solar.entity.ProjectDocumentEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectDocumentRepository extends JpaRepository<ProjectDocumentEntity, String> {
  Optional<ProjectDocumentEntity> findByProjectIdAndDocId(String projectId, String docId);
  List<ProjectDocumentEntity> findByProjectIdOrderByCreatedAtDesc(String projectId);
}
