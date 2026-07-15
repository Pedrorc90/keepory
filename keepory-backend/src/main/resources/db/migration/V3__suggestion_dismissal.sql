CREATE TABLE suggestion_dismissal (
    source       VARCHAR(20)  NOT NULL,
    external_id  VARCHAR(100) NOT NULL,
    dismissed_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (source, external_id)
);
