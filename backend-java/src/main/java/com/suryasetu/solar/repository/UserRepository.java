package com.suryasetu.solar.repository;

import com.suryasetu.solar.entity.UserEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<UserEntity, String> {
  Optional<UserEntity> findByEmailIgnoreCase(String email);
  boolean existsByEmailIgnoreCase(String email);
}
