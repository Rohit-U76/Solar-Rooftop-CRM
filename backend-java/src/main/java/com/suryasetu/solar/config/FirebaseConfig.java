package com.suryasetu.solar.config;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FirebaseConfig {

  private static final Logger log = LoggerFactory.getLogger(FirebaseConfig.class);

  @Value("${suryasetu.security.firebase-project-id:data-atom-n01dl}")
  private String firebaseProjectId;

  @PostConstruct
  public void initFirebase() {
    if (FirebaseApp.getApps().isEmpty() && firebaseProjectId != null && !firebaseProjectId.isBlank()) {
      FirebaseOptions options = FirebaseOptions.builder()
          .setProjectId(firebaseProjectId)
          .build();
      FirebaseApp.initializeApp(options);
      log.info("Initialized Firebase Admin token verifier for project {}", firebaseProjectId);
    }
  }
}
