BEGIN;

SET search_path TO lab_management, public;

CREATE TABLE lab_room_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code CITEXT NOT NULL,
    room_name VARCHAR(150) NOT NULL,
    building VARCHAR(100),
    floor VARCHAR(30),
    devices JSONB NOT NULL DEFAULT '[]'::jsonb,
    submitted_by UUID,
    submitted_by_name VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_lab_room_proposals_submitted_by
        FOREIGN KEY (submitted_by)
        REFERENCES users (id)
        ON DELETE SET NULL,
    CONSTRAINT ck_lab_room_proposals_room_code
        CHECK (length(trim(room_code::text)) BETWEEN 1 AND 64),
    CONSTRAINT ck_lab_room_proposals_room_name
        CHECK (length(trim(room_name)) BETWEEN 1 AND 150),
    CONSTRAINT ck_lab_room_proposals_devices_array
        CHECK (jsonb_typeof(devices) = 'array'),
    CONSTRAINT ck_lab_room_proposals_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE INDEX idx_lab_room_proposals_room_code_active
    ON lab_room_proposals (room_code)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_lab_room_proposals_created_at_active
    ON lab_room_proposals (created_at DESC)
    WHERE deleted_at IS NULL;

COMMIT;
