package com.keepory.auth;

import com.keepory.auth.dto.LoginRequest;
import com.keepory.auth.dto.UserResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.session.security.web.authentication.SpringSessionRememberMeServices;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final int REMEMBERED_TIMEOUT = (int) Duration.ofDays(30).toSeconds();

    /** Without "recordar sesión" the cookie dies with the browser, so the row need not linger. */
    private static final int PLAIN_TIMEOUT = (int) Duration.ofDays(10).toSeconds();

    private final AuthService service;
    private final SecurityContextRepository securityContextRepository;

    public AuthController(AuthService service, SecurityContextRepository securityContextRepository) {
        this.service = service;
        this.securityContextRepository = securityContextRepository;
    }

    @PostMapping("/login")
    public UserResponse login(@Valid @RequestBody LoginRequest request,
                              HttpServletRequest httpRequest,
                              HttpServletResponse httpResponse) {
        AppUserPrincipal principal = service.authenticate(request.email(), request.password());

        // Session fixation: drop whatever session id reached us before issuing one
        // tied to this login.
        HttpSession existing = httpRequest.getSession(false);
        if (existing != null) {
            existing.invalidate();
        }
        // This exact attribute and no other: Spring Boot autoconfigures a cookie
        // serializer customizer pointing at it, and it overwrites any custom one.
        // Marking it makes the session cookie persistent instead of dying with the
        // browser; the real deadline is the session timeout below, not the cookie.
        if (request.rememberMe()) {
            httpRequest.setAttribute(SpringSessionRememberMeServices.REMEMBER_ME_LOGIN_ATTR, true);
        }
        HttpSession session = httpRequest.getSession(true);
        session.setMaxInactiveInterval(request.rememberMe() ? REMEMBERED_TIMEOUT : PLAIN_TIMEOUT);

        Authentication authentication = UsernamePasswordAuthenticationToken.authenticated(
                principal, null, List.of());
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, httpRequest, httpResponse);

        return UserResponse.from(principal);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest httpRequest) {
        HttpSession session = httpRequest.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
    }

    /** The SPA calls this on boot: 200 means "session still good", 401 means "show the login screen". */
    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal AppUserPrincipal principal) {
        return UserResponse.from(principal);
    }
}
