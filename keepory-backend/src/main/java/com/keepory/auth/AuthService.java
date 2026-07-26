package com.keepory.auth;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final AppUserRepository repository;
    private final PasswordEncoder passwordEncoder;

    public AuthService(AppUserRepository repository, PasswordEncoder passwordEncoder) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public AppUserPrincipal authenticate(String email, String rawPassword) {
        // One generic failure for both cases: telling them apart would let anyone
        // probe which emails have an account.
        AppUser user = repository.findByEmail(email)
                .orElseThrow(() -> new BadCredentialsException("Email o contraseña incorrectos"));
        if (!passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
            throw new BadCredentialsException("Email o contraseña incorrectos");
        }
        return AppUserPrincipal.of(user);
    }
}
