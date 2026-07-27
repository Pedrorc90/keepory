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
        // Trimmed: these are pasted into a Render form, and a trailing space there
        // is invisible but locks the owner out of the account it just created.
        this.email = email.trim();
        this.password = password.trim();
        this.displayName = displayName.trim();
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (email.isBlank() || password.isBlank()) {
            log.info("Owner account not seeded: keepory.admin.email/password are unset");
            return;
        }
        // The env var is the owner's password of record: changing it in Render and
        // redeploying is the only way to recover the account, since there is no
        // password reset flow. Runs on every boot, and Render boots often.
        var existing = repository.findByEmail(email);
        if (existing.isPresent()) {
            AppUser owner = existing.get();
            if (!passwordEncoder.matches(password, owner.getPasswordHash())) {
                owner.setPasswordHash(passwordEncoder.encode(password));
                repository.save(owner);
                log.info("Owner password reset from configuration for {}", email);
            }
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
