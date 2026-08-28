BEGIN;

SET search_path TO lab_management, public;

CREATE TABLE exam_event_roster_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_event_id UUID NOT NULL,
    course_section_id UUID NOT NULL,
    stored_object_id UUID NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_exam_event_roster_files_event
        FOREIGN KEY (exam_event_id)
        REFERENCES exam_events (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_exam_event_roster_files_section
        FOREIGN KEY (course_section_id)
        REFERENCES course_sections (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_exam_event_roster_files_object
        FOREIGN KEY (stored_object_id)
        REFERENCES stored_objects (id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_exam_event_roster_files_filename
        CHECK (length(original_filename) BETWEEN 1 AND 255),
    CONSTRAINT ck_exam_event_roster_files_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE UNIQUE INDEX uq_exam_event_roster_files_object_active
    ON exam_event_roster_files (exam_event_id, stored_object_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_exam_event_roster_files_event
    ON exam_event_roster_files (exam_event_id)
    WHERE deleted_at IS NULL;

CREATE TABLE exam_event_allowed_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_event_id UUID NOT NULL,
    course_section_id UUID NOT NULL,
    student_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_exam_event_allowed_students_event
        FOREIGN KEY (exam_event_id)
        REFERENCES exam_events (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_exam_event_allowed_students_section
        FOREIGN KEY (course_section_id)
        REFERENCES course_sections (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_exam_event_allowed_students_student
        FOREIGN KEY (student_id)
        REFERENCES students (id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_exam_event_allowed_students_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE UNIQUE INDEX uq_exam_event_allowed_students_active
    ON exam_event_allowed_students (exam_event_id, course_section_id, student_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_exam_event_allowed_students_event_section
    ON exam_event_allowed_students (exam_event_id, course_section_id)
    WHERE deleted_at IS NULL;

CREATE TRIGGER trg_90_exam_event_roster_files_updated_at
    BEFORE UPDATE ON exam_event_roster_files
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_90_exam_event_allowed_students_updated_at
    BEFORE UPDATE ON exam_event_allowed_students
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
