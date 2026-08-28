BEGIN;

SET search_path TO lab_management, public;

CREATE TABLE course_section_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_section_id UUID NOT NULL,
    stored_object_id UUID NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_course_section_files_section
        FOREIGN KEY (course_section_id)
        REFERENCES course_sections (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_course_section_files_object
        FOREIGN KEY (stored_object_id)
        REFERENCES stored_objects (id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_course_section_files_filename
        CHECK (length(original_filename) BETWEEN 1 AND 255),
    CONSTRAINT ck_course_section_files_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE UNIQUE INDEX uq_course_section_files_object_active
    ON course_section_files (course_section_id, stored_object_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_course_section_files_section
    ON course_section_files (course_section_id)
    WHERE deleted_at IS NULL;

CREATE TRIGGER trg_90_course_section_files_updated_at
    BEFORE UPDATE ON course_section_files
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
