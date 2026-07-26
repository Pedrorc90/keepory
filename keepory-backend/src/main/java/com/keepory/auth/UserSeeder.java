package com.keepory.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Creates the owner account from environment variables. There is no open sign-up:
 * accounts are handed out deliberately, so this is how the first one gets in.
 */
@Component
class UserSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(UserSeeder.class);

    private final AppUserRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final String email;
    private final String password;
    private final String displayName;

    UserSeeder(AppUserRepository repository,
               PasswordEncoder passwordEncoder,
               @Value("${keepory.admin.email:}") String email,
               @Value("${keepory.admin.password:}") String password,
               @Value("${keepory.admin.display-name:}") String displayName) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.email = email;
        this.password = password;
        this.displayName = displayName;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (email.isBlank() || password.isBlank()) {
            log.info("Owner account not seeded: keepory.admin.email/password are unset");
            return;
        }
        // Idempotent: this runs on every boot, and Render boots often.
        if (repository.findByEmail(email).isPresent()) {
            return;
        }
        AppUser user = new AppUser();
        user.setId(UUID.randomUUID());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setDisplayName(displayName.isBlank() ? email : displayName);
        repository.save(user);
        log.info("Owner account created for {}", email);
    }
}
