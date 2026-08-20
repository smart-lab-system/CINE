-- PostgreSQL schema v2 for the Lab Exam Management system.
-- Target: PostgreSQL 16+.
-- This script is intended to run as one transaction on a clean database.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SCHEMA IF NOT EXISTS lab_management;
SET search_path TO lab_management, public;

CREATE TYPE account_status AS ENUM (
    'pending',
    'active',
    'locked',
    'disabled'
);

CREATE TYPE actor_type AS ENUM (
    'user',
    'system'
);

CREATE TYPE exam_file_role AS ENUM (
    'question',
    'attachment',
    'answer_template',
    'guide'
);

CREATE TYPE session_type AS ENUM (
    'exam',
    'practice'
);

CREATE TYPE exam_event_status AS ENUM (
    'draft',
    'scheduled',
    'active',
    'completed',
    'cancelled',
    'aborted'
);

CREATE TYPE session_status AS ENUM (
    'draft',
    'scheduled',
    'active',
    'completed',
    'cancelled',
    'aborted'
);

CREATE TYPE participant_status AS ENUM (
    'registered',
    'checked_in',
    'absent',
    'submitted',
    'disqualified'
);

CREATE TYPE proctor_role AS ENUM (
    'lead',
    'assistant'
);

CREATE TYPE booking_status AS ENUM (
    'tentative',
    'reserved',
    'released'
);

CREATE TYPE submission_method AS ENUM (
    'agent_push',
    'tutor_collect',
    'web_upload',
    'manual_import'
);

CREATE TYPE submission_status AS ENUM (
    'received',
    'verified',
    'rejected',
    'revoked',
    'superseded'
);

CREATE TYPE artifact_kind AS ENUM (
    'primary',
    'backup',
    'resubmission'
);

-- Identity and RBAC.
CREATE TABLE roles (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_roles_code UNIQUE (code),
    CONSTRAINT ck_roles_code_format
        CHECK (code ~ '^[a-z][a-z0-9_]{1,31}$')
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username CITEXT NOT NULL,
    email CITEXT,
    password_hash TEXT NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20),
    status account_status NOT NULL DEFAULT 'pending',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT ck_users_username_format
        CHECK (username::TEXT ~ '^[A-Za-z0-9._-]{3,64}$'),
    CONSTRAINT ck_users_email_format
        CHECK (
            email IS NULL
            OR email::TEXT ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        ),
    CONSTRAINT ck_users_password_hash
        CHECK (length(password_hash) >= 20),
    CONSTRAINT ck_users_phone
        CHECK (
            phone IS NULL
            OR phone ~ '^[+]?[0-9 ()-]{8,20}$'
        ),
    CONSTRAINT ck_users_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role_id SMALLINT NOT NULL,
    assigned_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_user_roles_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_user_roles_role
        FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT,
    CONSTRAINT fk_user_roles_assigned_by
        FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_user_roles_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    student_code CITEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    date_of_birth DATE,
    class_code VARCHAR(50),
    cohort_year SMALLINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_students_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_students_code
        CHECK (student_code::TEXT ~ '^[A-Za-z0-9._-]{3,32}$'),
    CONSTRAINT ck_students_cohort
        CHECK (cohort_year IS NULL OR cohort_year BETWEEN 1900 AND 2200),
    CONSTRAINT ck_students_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE TABLE lecturers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    employee_code CITEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    department VARCHAR(150),
    academic_title VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_lecturers_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_lecturers_code
        CHECK (employee_code::TEXT ~ '^[A-Za-z0-9._-]{2,32}$'),
    CONSTRAINT ck_lecturers_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

-- Academic master data.
CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code CITEXT NOT NULL,
    name VARCHAR(200) NOT NULL,
    credits SMALLINT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT ck_subjects_code
        CHECK (code::TEXT ~ '^[A-Za-z0-9._-]{2,32}$'),
    CONSTRAINT ck_subjects_credits
        CHECK (credits IS NULL OR credits BETWEEN 0 AND 30),
    CONSTRAINT ck_subjects_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE TABLE academic_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code CITEXT NOT NULL,
    name VARCHAR(150) NOT NULL,
    starts_on DATE NOT NULL,
    ends_on DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT ck_academic_terms_code
        CHECK (code::TEXT ~ '^[A-Za-z0-9._-]{2,32}$'),
    CONSTRAINT ck_academic_terms_dates
        CHECK (ends_on >= starts_on),
    CONSTRAINT ck_academic_terms_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE TABLE course_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL,
    academic_term_id UUID NOT NULL,
    section_code CITEXT NOT NULL,
    nominal_class_code VARCHAR(50),
    name VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_course_sections_id_subject UNIQUE (id, subject_id),
    CONSTRAINT fk_course_sections_subject
        FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE RESTRICT,
    CONSTRAINT fk_course_sections_academic_term
        FOREIGN KEY (academic_term_id)
        REFERENCES academic_terms (id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_course_sections_code
        CHECK (section_code::TEXT ~ '^[A-Za-z0-9._-]{1,64}$'),
    CONSTRAINT ck_course_sections_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE TABLE course_section_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_section_id UUID NOT NULL,
    student_id UUID NOT NULL,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_course_section_enrollments_section
        FOREIGN KEY (course_section_id)
        REFERENCES course_sections (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_course_section_enrollments_student
        FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE RESTRICT,
    CONSTRAINT ck_course_section_enrollments_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

-- Lab and seating master data.
CREATE TABLE labs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code CITEXT NOT NULL,
    name VARCHAR(150) NOT NULL,
    building VARCHAR(100),
    floor VARCHAR(30),
    capacity SMALLINT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT ck_labs_code
        CHECK (code::TEXT ~ '^[A-Za-z0-9._-]{2,32}$'),
    CONSTRAINT ck_labs_capacity
        CHECK (capacity > 0),
    CONSTRAINT ck_labs_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE TABLE workstations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_id UUID NOT NULL,
    agent_id UUID NOT NULL DEFAULT gen_random_uuid(),
    asset_code CITEXT NOT NULL,
    hostname CITEXT NOT NULL,
    mac_address MACADDR,
    static_ip_address INET,
    serial_number VARCHAR(100),
    operating_system VARCHAR(120),
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_workstations_id_lab UNIQUE (id, lab_id),
    CONSTRAINT uq_workstations_agent_id UNIQUE (agent_id),
    CONSTRAINT fk_workstations_lab
        FOREIGN KEY (lab_id) REFERENCES labs (id) ON DELETE RESTRICT,
    CONSTRAINT ck_workstations_asset_code
        CHECK (asset_code::TEXT ~ '^[A-Za-z0-9._-]{2,64}$'),
    CONSTRAINT ck_workstations_hostname
        CHECK (hostname::TEXT ~ '^[A-Za-z0-9][A-Za-z0-9.-]{0,62}$'),
    CONSTRAINT ck_workstations_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE TABLE lab_layouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_id UUID NOT NULL,
    name VARCHAR(150) NOT NULL,
    version_no INTEGER NOT NULL DEFAULT 1,
    canvas_width INTEGER NOT NULL DEFAULT 1280,
    canvas_height INTEGER NOT NULL DEFAULT 720,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_lab_layouts_id_lab UNIQUE (id, lab_id),
    CONSTRAINT fk_lab_layouts_lab
        FOREIGN KEY (lab_id) REFERENCES labs (id) ON DELETE RESTRICT,
    CONSTRAINT ck_lab_layouts_version
        CHECK (version_no > 0),
    CONSTRAINT ck_lab_layouts_canvas
        CHECK (canvas_width > 0 AND canvas_height > 0),
    CONSTRAINT ck_lab_layouts_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE TABLE lab_seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layout_id UUID NOT NULL,
    lab_id UUID NOT NULL,
    workstation_id UUID,
    seat_code CITEXT NOT NULL,
    row_no SMALLINT,
    column_no SMALLINT,
    position_x NUMERIC(10, 2) NOT NULL,
    position_y NUMERIC(10, 2) NOT NULL,
    rotation_degrees NUMERIC(5, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_lab_seats_id_layout UNIQUE (id, layout_id),
    CONSTRAINT fk_lab_seats_layout_lab
        FOREIGN KEY (layout_id, lab_id)
        REFERENCES lab_layouts (id, lab_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_lab_seats_workstation_lab
        FOREIGN KEY (workstation_id, lab_id)
        REFERENCES workstations (id, lab_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_lab_seats_grid
        CHECK (
            (row_no IS NULL OR row_no > 0)
            AND (column_no IS NULL OR column_no > 0)
        ),
    CONSTRAINT ck_lab_seats_position
        CHECK (position_x >= 0 AND position_y >= 0),
    CONSTRAINT ck_lab_seats_rotation
        CHECK (rotation_degrees BETWEEN -360 AND 360),
    CONSTRAINT ck_lab_seats_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

-- MinIO object metadata. Upload lifecycle/quarantine is intentionally not
-- modeled here; only verified object metadata belongs in this table.
CREATE TABLE stored_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_name VARCHAR(63) NOT NULL,
    object_key TEXT NOT NULL,
    object_uri TEXT NOT NULL,
    sha256 BYTEA NOT NULL,
    size_bytes BIGINT NOT NULL,
    content_type VARCHAR(255),
    etag VARCHAR(128),
    uploaded_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_stored_objects_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_stored_objects_bucket
        CHECK (bucket_name ~ '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$'),
    CONSTRAINT ck_stored_objects_key
        CHECK (length(object_key) BETWEEN 1 AND 1024),
    CONSTRAINT ck_stored_objects_uri
        CHECK (object_uri ~ '^[a-z][a-z0-9+.-]*://'),
    CONSTRAINT ck_stored_objects_sha256
        CHECK (octet_length(sha256) = 32),
    CONSTRAINT ck_stored_objects_size
        CHECK (size_bytes >= 0),
    CONSTRAINT ck_stored_objects_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

-- Exam-event aggregate. One logical file package is represented by the
-- event's immutable manifest_sha256 after publication.
CREATE TABLE exam_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code CITEXT NOT NULL,
    title VARCHAR(250) NOT NULL,
    subject_id UUID NOT NULL,
    session_type session_type NOT NULL,
    scheduled_start_at TIMESTAMPTZ NOT NULL,
    scheduled_end_at TIMESTAMPTZ NOT NULL,
    schedule_window TSTZRANGE GENERATED ALWAYS AS (
        tstzrange(scheduled_start_at, scheduled_end_at, '[)')
    ) STORED,
    duration_minutes SMALLINT NOT NULL,
    policy_template_document_id VARCHAR(64),
    policy_snapshot_document_id VARCHAR(64),
    status exam_event_status NOT NULL DEFAULT 'draft',
    actual_start_at TIMESTAMPTZ,
    actual_end_at TIMESTAMPTZ,
    manifest_sha256 BYTEA,
    manifest_published_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_exam_events_id_subject UNIQUE (id, subject_id),
    CONSTRAINT fk_exam_events_subject
        FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE RESTRICT,
    CONSTRAINT fk_exam_events_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_exam_events_schedule
        CHECK (scheduled_end_at > scheduled_start_at),
    CONSTRAINT ck_exam_events_duration
        CHECK (duration_minutes > 0),
    CONSTRAINT ck_exam_events_policy_reference
        CHECK (
            policy_snapshot_document_id IS NULL
            OR policy_template_document_id IS NOT NULL
        ),
    CONSTRAINT ck_exam_events_manifest_sha256
        CHECK (
            manifest_sha256 IS NULL
            OR octet_length(manifest_sha256) = 32
        ),
    CONSTRAINT ck_exam_events_manifest_pair
        CHECK (
            (manifest_sha256 IS NULL) = (manifest_published_at IS NULL)
        ),
    CONSTRAINT ck_exam_events_manifest_required
        CHECK (
            status NOT IN ('scheduled', 'active', 'completed', 'aborted')
            OR manifest_sha256 IS NOT NULL
        ),
    CONSTRAINT ck_exam_events_actual_time
        CHECK (
            (status IN ('draft', 'scheduled', 'cancelled')
                AND actual_start_at IS NULL
                AND actual_end_at IS NULL)
            OR (status = 'active'
                AND actual_start_at IS NOT NULL
                AND actual_end_at IS NULL)
            OR (status IN ('completed', 'aborted')
                AND actual_start_at IS NOT NULL
                AND actual_end_at IS NOT NULL
                AND actual_end_at >= actual_start_at)
        ),
    CONSTRAINT ck_exam_events_row_version
        CHECK (row_version >= 0),
    CONSTRAINT ck_exam_events_deleted_at
        CHECK (
            deleted_at IS NULL
            OR (status = 'draft' AND deleted_at >= created_at)
        )
);

CREATE TABLE exam_event_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_event_id UUID NOT NULL,
    course_section_id UUID NOT NULL,
    subject_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_exam_event_sections_event_subject
        FOREIGN KEY (exam_event_id, subject_id)
        REFERENCES exam_events (id, subject_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_exam_event_sections_section_subject
        FOREIGN KEY (course_section_id, subject_id)
        REFERENCES course_sections (id, subject_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_exam_event_sections_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE TABLE exam_event_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_event_id UUID NOT NULL,
    stored_object_id UUID NOT NULL,
    file_role exam_file_role NOT NULL,
    title VARCHAR(250),
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_exam_event_files_event
        FOREIGN KEY (exam_event_id)
        REFERENCES exam_events (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_exam_event_files_object
        FOREIGN KEY (stored_object_id)
        REFERENCES stored_objects (id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_exam_event_files_sort_order
        CHECK (sort_order >= 0),
    CONSTRAINT ck_exam_event_files_deleted_at
        CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

-- A lab session is one room within an exam event. Subject, session type,
-- policy and duration are inherited from exam_events.
CREATE TABLE lab_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_event_id UUID NOT NULL,
    code CITEXT NOT NULL,
    title VARCHAR(250) NOT NULL,
    lab_id UUID NOT NULL,
    layout_id UUID NOT NULL,
    scheduled_start_at TIMESTAMPTZ NOT NULL,
    scheduled_end_at TIMESTAMPTZ NOT NULL,
    schedule_window TSTZRANGE GENERATED ALWAYS AS (
        tstzrange(scheduled_start_at, scheduled_end_at, '[)')
    ) STORED,
    status session_status NOT NULL DEFAULT 'draft',
    actual_start_at TIMESTAMPTZ,
    actual_end_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_lab_sessions_id_layout UNIQUE (id, layout_id),
    CONSTRAINT uq_lab_sessions_id_event UNIQUE (id, exam_event_id),
    CONSTRAINT fk_lab_sessions_event
        FOREIGN KEY (exam_event_id)
        REFERENCES exam_events (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_lab_sessions_lab
        FOREIGN KEY (lab_id) REFERENCES labs (id) ON DELETE RESTRICT,
    CONSTRAINT fk_lab_sessions_layout_lab
        FOREIGN KEY (layout_id, lab_id)
        REFERENCES lab_layouts (id, lab_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_lab_sessions_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_lab_sessions_schedule
        CHECK (scheduled_end_at > scheduled_start_at),
    CONSTRAINT ck_lab_sessions_actual_time
        CHECK (
            (status IN ('draft', 'scheduled', 'cancelled')
                AND actual_start_at IS NULL
                AND actual_end_at IS NULL)
            OR (status = 'active'
                AND actual_start_at IS NOT NULL
                AND actual_end_at IS NULL)
            OR (status IN ('completed', 'aborted')
                AND actual_start_at IS NOT NULL
                AND actual_end_at IS NOT NULL
                AND actual_end_at >= actual_start_at)
        ),
    CONSTRAINT ck_lab_sessions_row_version
        CHECK (row_version >= 0),
    CONSTRAINT ck_lab_sessions_deleted_at
        CHECK (
            deleted_at IS NULL
            OR (status = 'draft' AND deleted_at >= created_at)
        ),
    CONSTRAINT ex_lab_sessions_no_overlap
        EXCLUDE USING gist (
            lab_id WITH =,
            schedule_window WITH &&
        )
        WHERE (
            deleted_at IS NULL
            AND status IN ('scheduled', 'active')
        )
        DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE session_proctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    lecturer_id UUID NOT NULL,
    role proctor_role NOT NULL DEFAULT 'assistant',
    assigned_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_session_proctors_session_lecturer
        UNIQUE (session_id, lecturer_id),
    CONSTRAINT fk_session_proctors_session
        FOREIGN KEY (session_id)
        REFERENCES lab_sessions (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_session_proctors_lecturer
        FOREIGN KEY (lecturer_id)
        REFERENCES lecturers (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_session_proctors_assigned_by
        FOREIGN KEY (assigned_by)
        REFERENCES users (id)
        ON DELETE RESTRICT
);

-- Roster remains room/session scoped. No exam_event_participants table is
-- introduced until event-level roster semantics are explicitly approved.
CREATE TABLE session_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    layout_id UUID NOT NULL,
    course_section_id UUID NOT NULL,
    student_id UUID NOT NULL,
    seat_id UUID,
    status participant_status NOT NULL DEFAULT 'registered',
    checked_in_at TIMESTAMPTZ,
    checked_out_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_session_participants_id_session UNIQUE (id, session_id),
    CONSTRAINT uq_session_participants_session_student
        UNIQUE (session_id, student_id),
    CONSTRAINT fk_session_participants_session_layout
        FOREIGN KEY (session_id, layout_id)
        REFERENCES lab_sessions (id, layout_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_session_participants_course_section
        FOREIGN KEY (course_section_id)
        REFERENCES course_sections (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_session_participants_student
        FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE RESTRICT,
    CONSTRAINT fk_session_participants_seat_layout
        FOREIGN KEY (seat_id, layout_id)
        REFERENCES lab_seats (id, layout_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_session_participants_check_time
        CHECK (
            checked_out_at IS NULL
            OR (
                checked_in_at IS NOT NULL
                AND checked_out_at >= checked_in_at
            )
        )
);

-- Materialized person schedules. Assignment rows are authoritative; these
-- rows are synchronized by triggers below.
CREATE TABLE lecturer_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lecturer_id UUID NOT NULL,
    session_id UUID NOT NULL,
    schedule_window TSTZRANGE NOT NULL,
    booking_status booking_status NOT NULL DEFAULT 'tentative',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_lecturer_bookings_session_lecturer
        UNIQUE (session_id, lecturer_id),
    CONSTRAINT fk_lecturer_bookings_assignment
        FOREIGN KEY (session_id, lecturer_id)
        REFERENCES session_proctors (session_id, lecturer_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT ck_lecturer_bookings_window
        CHECK (
            NOT isempty(schedule_window)
            AND lower(schedule_window) IS NOT NULL
            AND upper(schedule_window) IS NOT NULL
            AND lower(schedule_window) < upper(schedule_window)
        ),
    CONSTRAINT ex_lecturer_bookings_no_overlap
        EXCLUDE USING gist (
            lecturer_id WITH =,
            schedule_window WITH &&
        )
        WHERE (booking_status = 'reserved')
        DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE student_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL,
    session_id UUID NOT NULL,
    schedule_window TSTZRANGE NOT NULL,
    booking_status booking_status NOT NULL DEFAULT 'tentative',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_student_bookings_session_student
        UNIQUE (session_id, student_id),
    CONSTRAINT fk_student_bookings_assignment
        FOREIGN KEY (session_id, student_id)
        REFERENCES session_participants (session_id, student_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT ck_student_bookings_window
        CHECK (
            NOT isempty(schedule_window)
            AND lower(schedule_window) IS NOT NULL
            AND upper(schedule_window) IS NOT NULL
            AND lower(schedule_window) < upper(schedule_window)
        ),
    CONSTRAINT ex_student_bookings_no_overlap
        EXCLUDE USING gist (
            student_id WITH =,
            schedule_window WITH &&
        )
        WHERE (booking_status = 'reserved')
        DEFERRABLE INITIALLY IMMEDIATE
);

-- Append-only status histories.
CREATE TABLE exam_event_status_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_event_id UUID NOT NULL,
    from_status exam_event_status,
    to_status exam_event_status NOT NULL,
    reason TEXT NOT NULL,
    actor_type actor_type NOT NULL,
    changed_by UUID,
    command_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_exam_event_status_history_event
        FOREIGN KEY (exam_event_id)
        REFERENCES exam_events (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_exam_event_status_history_changed_by
        FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_exam_event_status_history_transition
        CHECK (from_status IS NULL OR from_status <> to_status),
    CONSTRAINT ck_exam_event_status_history_reason
        CHECK (btrim(reason) <> ''),
    CONSTRAINT ck_exam_event_status_history_actor
        CHECK (
            (actor_type = 'user' AND changed_by IS NOT NULL)
            OR (actor_type = 'system' AND changed_by IS NULL)
        )
);

CREATE TABLE session_status_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id UUID NOT NULL,
    from_status session_status,
    to_status session_status NOT NULL,
    reason TEXT NOT NULL,
    actor_type actor_type NOT NULL,
    changed_by UUID,
    command_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_session_status_history_session
        FOREIGN KEY (session_id)
        REFERENCES lab_sessions (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_session_status_history_changed_by
        FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_session_status_history_transition
        CHECK (from_status IS NULL OR from_status <> to_status),
    CONSTRAINT ck_session_status_history_reason
        CHECK (btrim(reason) <> ''),
    CONSTRAINT ck_session_status_history_actor
        CHECK (
            (actor_type = 'user' AND changed_by IS NOT NULL)
            OR (actor_type = 'system' AND changed_by IS NULL)
        )
);

-- Submission metadata. Submission deadline is intentionally not modeled.
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL,
    session_id UUID NOT NULL,
    attempt_no SMALLINT NOT NULL DEFAULT 1,
    method submission_method NOT NULL,
    status submission_status NOT NULL DEFAULT 'received',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_reported_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    received_by UUID,
    is_final BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_submissions_participant_session
        FOREIGN KEY (participant_id, session_id)
        REFERENCES session_participants (id, session_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_submissions_received_by
        FOREIGN KEY (received_by) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_submissions_attempt
        CHECK (attempt_no > 0),
    CONSTRAINT ck_submissions_verified_time
        CHECK (verified_at IS NULL OR verified_at >= submitted_at)
);

CREATE TABLE submission_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL,
    stored_object_id UUID NOT NULL,
    kind artifact_kind NOT NULL DEFAULT 'primary',
    version_no INTEGER NOT NULL DEFAULT 1,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_submission_artifacts_submission
        FOREIGN KEY (submission_id)
        REFERENCES submissions (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_submission_artifacts_object
        FOREIGN KEY (stored_object_id)
        REFERENCES stored_objects (id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_submission_artifacts_version
        CHECK (version_no > 0)
);

-- Seat-assignment history is intentionally not modeled; session_participants
-- stores only the current room-level roster assignment.

CREATE TABLE audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_type actor_type NOT NULL DEFAULT 'system',
    actor_user_id UUID,
    command_id UUID NOT NULL DEFAULT gen_random_uuid(),
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id TEXT NOT NULL,
    request_id UUID,
    ip_address INET,
    user_agent TEXT,
    changes JSONB NOT NULL DEFAULT '{}'::JSONB,
    context JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (occurred_at, id),
    CONSTRAINT fk_audit_logs_actor
        FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_audit_logs_actor
        CHECK (
            (actor_type = 'user' AND actor_user_id IS NOT NULL)
            OR (actor_type = 'system' AND actor_user_id IS NULL)
        ),
    CONSTRAINT ck_audit_logs_action
        CHECK (action ~ '^[a-z][a-z0-9_.-]{1,79}$'),
    CONSTRAINT ck_audit_logs_entity_type
        CHECK (entity_type ~ '^[a-z][a-z0-9_.-]{1,79}$'),
    CONSTRAINT ck_audit_logs_changes_object
        CHECK (jsonb_typeof(changes) = 'object'),
    CONSTRAINT ck_audit_logs_context_object
        CHECK (jsonb_typeof(context) = 'object')
) PARTITION BY RANGE (occurred_at);

CREATE TABLE audit_logs_default
PARTITION OF audit_logs DEFAULT;

-- Utility trigger functions.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lab_management, public
AS $$
BEGIN
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_versioned_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lab_management, public
AS $$
BEGIN
    NEW.updated_at := clock_timestamp();
    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lab_management, public
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; % is not allowed',
        TG_TABLE_NAME,
        TG_OP
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE OR REPLACE FUNCTION session_has_ready_lead(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = lab_management, public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM session_proctors AS sp
        JOIN lecturers AS l
          ON l.id = sp.lecturer_id
         AND l.deleted_at IS NULL
        JOIN users AS u
          ON u.id = l.user_id
         AND u.deleted_at IS NULL
         AND u.status = 'active'
        WHERE sp.session_id = p_session_id
          AND sp.role = 'lead'
    );
$$;

-- Event lifecycle, publication and package-manifest guard.
CREATE OR REPLACE FUNCTION validate_exam_event_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lab_management, public
AS $$
DECLARE
    v_manifest_text TEXT;
    v_file_count BIGINT;
    v_question_count BIGINT;
    v_first_session_start TIMESTAMPTZ;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'draft' THEN
            RAISE EXCEPTION 'An exam event must be created in draft status'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.manifest_sha256 IS NOT NULL
           OR NEW.manifest_published_at IS NOT NULL
           OR NEW.actual_start_at IS NOT NULL
           OR NEW.actual_end_at IS NOT NULL THEN
            RAISE EXCEPTION
                'A new draft event cannot have manifest or actual timestamps'
                USING ERRCODE = 'check_violation';
        END IF;

        RETURN NEW;
    END IF;

    IF OLD.deleted_at IS NOT NULL
       AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'A deleted exam event cannot be changed'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'A deleted exam event cannot change status'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;

        IF NOT (
            (OLD.status = 'draft'
                AND NEW.status IN ('scheduled', 'cancelled'))
            OR (OLD.status = 'scheduled'
                AND NEW.status IN ('active', 'cancelled'))
            OR (OLD.status = 'active'
                AND NEW.status IN ('completed', 'aborted'))
        ) THEN
            RAISE EXCEPTION 'Invalid exam event status transition: % -> %',
                OLD.status,
                NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF OLD.status <> 'draft'
       AND (
            NEW.code,
            NEW.title,
            NEW.subject_id,
            NEW.session_type,
            NEW.scheduled_start_at,
            NEW.scheduled_end_at,
            NEW.duration_minutes,
            NEW.policy_template_document_id,
            NEW.policy_snapshot_document_id
       ) IS DISTINCT FROM (
            OLD.code,
            OLD.title,
            OLD.subject_id,
            OLD.session_type,
            OLD.scheduled_start_at,
            OLD.scheduled_end_at,
            OLD.duration_minutes,
            OLD.policy_template_document_id,
            OLD.policy_snapshot_document_id
       ) THEN
        RAISE EXCEPTION
            'Published exam event configuration is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status <> 'draft'
       AND (
            NEW.manifest_sha256,
            NEW.manifest_published_at
       ) IS DISTINCT FROM (
            OLD.manifest_sha256,
            OLD.manifest_published_at
       ) THEN
        RAISE EXCEPTION 'Published event manifest is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status = 'draft' AND NEW.status = 'scheduled' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM exam_event_sections AS ees
            WHERE ees.exam_event_id = NEW.id
              AND ees.deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION
                'Event % must contain at least one active course section',
                NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM lab_sessions AS ls
            WHERE ls.exam_event_id = NEW.id
              AND ls.deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION
                'Event % must contain at least one active lab session',
                NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM lab_sessions AS ls
            WHERE ls.exam_event_id = NEW.id
              AND ls.deleted_at IS NULL
              AND ls.status <> 'draft'
        ) THEN
            RAISE EXCEPTION
                'All active lab sessions must be draft when event % is scheduled',
                NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM lab_sessions AS ls
            WHERE ls.exam_event_id = NEW.id
              AND ls.deleted_at IS NULL
              AND NOT session_has_ready_lead(ls.id)
        ) THEN
            RAISE EXCEPTION
                'Every session in event % needs a lead proctor with an active user account',
                NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

        SELECT
            count(*),
            count(*) FILTER (WHERE eef.file_role = 'question'),
            string_agg(
                format(
                    '%s|%s|%s|%s|%s',
                    eef.file_role::TEXT,
                    eef.sort_order,
                    eef.stored_object_id,
                    encode(so.sha256, 'hex'),
                    so.size_bytes
                ),
                E'\n'
                ORDER BY
                    eef.file_role::TEXT,
                    eef.sort_order,
                    eef.stored_object_id::TEXT
            )
        INTO
            v_file_count,
            v_question_count,
            v_manifest_text
        FROM exam_event_files AS eef
        JOIN stored_objects AS so
          ON so.id = eef.stored_object_id
         AND so.deleted_at IS NULL
        WHERE eef.exam_event_id = NEW.id
          AND eef.deleted_at IS NULL;

        IF v_file_count = 0 OR v_question_count = 0 THEN
            RAISE EXCEPTION
                'Event % needs at least one active question file',
                NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

        -- Canonical UTF-8 line format:
        -- role|sort_order|stored_object_id|sha256_hex|size_bytes
        NEW.manifest_sha256 :=
            digest(convert_to(v_manifest_text, 'UTF8'), 'sha256');
        NEW.manifest_published_at := clock_timestamp();
    ELSIF OLD.status = 'draft' THEN
        IF NEW.manifest_sha256 IS NOT NULL
           OR NEW.manifest_published_at IS NOT NULL THEN
            RAISE EXCEPTION
                'Manifest is database-managed and only published on draft -> scheduled'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
    END IF;

    IF NEW.status = 'active' AND OLD.status <> 'active' THEN
        SELECT min(ls.actual_start_at)
        INTO v_first_session_start
        FROM lab_sessions AS ls
        WHERE ls.exam_event_id = NEW.id
          AND ls.deleted_at IS NULL
          AND ls.status = 'active';

        IF v_first_session_start IS NULL THEN
            RAISE EXCEPTION
                'Event % can become active only after a room session starts',
                NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

        NEW.actual_start_at :=
            COALESCE(NEW.actual_start_at, v_first_session_start);
        NEW.actual_end_at := NULL;
    ELSIF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
        IF EXISTS (
            SELECT 1
            FROM lab_sessions AS ls
            WHERE ls.exam_event_id = NEW.id
              AND ls.deleted_at IS NULL
              AND ls.status NOT IN ('completed', 'cancelled', 'aborted')
        ) OR EXISTS (
            SELECT 1
            FROM lab_sessions AS ls
            WHERE ls.exam_event_id = NEW.id
              AND ls.deleted_at IS NULL
              AND ls.status = 'aborted'
        ) OR NOT EXISTS (
            SELECT 1
            FROM lab_sessions AS ls
            WHERE ls.exam_event_id = NEW.id
              AND ls.deleted_at IS NULL
              AND ls.status = 'completed'
        ) THEN
            RAISE EXCEPTION
                'Event % can complete only when all rooms are terminal without aborts and at least one completed',
                NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

        NEW.actual_start_at :=
            COALESCE(NEW.actual_start_at, OLD.actual_start_at);
        NEW.actual_end_at :=
            COALESCE(NEW.actual_end_at, clock_timestamp());
    ELSIF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
        IF EXISTS (
            SELECT 1
            FROM lab_sessions AS ls
            WHERE ls.exam_event_id = NEW.id
              AND ls.deleted_at IS NULL
              AND (
                    ls.actual_start_at IS NOT NULL
                    OR ls.status IN ('active', 'completed', 'aborted')
              )
        ) THEN
            RAISE EXCEPTION
                'Event % cannot be cancelled after any room has started; abort it instead',
                NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

        NEW.actual_start_at := NULL;
        NEW.actual_end_at := NULL;
    ELSIF NEW.status = 'aborted' AND OLD.status <> 'aborted' THEN
        NEW.actual_start_at :=
            COALESCE(NEW.actual_start_at, OLD.actual_start_at);
        NEW.actual_end_at :=
            COALESCE(NEW.actual_end_at, clock_timestamp());
    END IF;

    RETURN NEW;
END;
$$;

-- Session lifecycle and room readiness guard.
CREATE OR REPLACE FUNCTION validate_lab_session_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lab_management, public
AS $$
DECLARE
    v_event exam_events%ROWTYPE;
BEGIN
    SELECT *
    INTO v_event
    FROM exam_events
    WHERE id = NEW.exam_event_id;

    IF NOT FOUND OR v_event.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Session must reference an active exam event'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'draft' THEN
            RAISE EXCEPTION 'A lab session must be created in draft status'
                USING ERRCODE = 'check_violation';
        END IF;

        IF v_event.status <> 'draft' THEN
            RAISE EXCEPTION
                'A lab session can be added only while its event is draft'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;

        IF NEW.scheduled_start_at IS NULL THEN
            NEW.scheduled_start_at := v_event.scheduled_start_at;
        END IF;
        IF NEW.scheduled_end_at IS NULL THEN
            NEW.scheduled_end_at := v_event.scheduled_end_at;
        END IF;

        IF NEW.actual_start_at IS NOT NULL
           OR NEW.actual_end_at IS NOT NULL THEN
            RAISE EXCEPTION
                'A new draft session cannot have actual timestamps'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        IF OLD.deleted_at IS NOT NULL
           AND NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION 'A deleted lab session cannot be changed'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;

        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
                RAISE EXCEPTION 'A deleted lab session cannot change status'
                    USING ERRCODE = 'object_not_in_prerequisite_state';
            END IF;

            IF NOT (
                (OLD.status = 'draft'
                    AND NEW.status IN ('scheduled', 'cancelled'))
                OR (OLD.status = 'scheduled'
                    AND NEW.status IN ('active', 'cancelled'))
                OR (OLD.status = 'active'
                    AND NEW.status IN ('completed', 'aborted'))
            ) THEN
                RAISE EXCEPTION
                    'Invalid lab session status transition: % -> %',
                    OLD.status,
                    NEW.status
                    USING ERRCODE = 'check_violation';
            END IF;
        END IF;

        IF OLD.status <> 'draft'
           AND (
                NEW.exam_event_id,
                NEW.code,
                NEW.title,
                NEW.lab_id,
                NEW.layout_id,
                NEW.scheduled_start_at,
                NEW.scheduled_end_at
           ) IS DISTINCT FROM (
                OLD.exam_event_id,
                OLD.code,
                OLD.title,
                OLD.lab_id,
                OLD.layout_id,
                OLD.scheduled_start_at,
                OLD.scheduled_end_at
           ) THEN
            RAISE EXCEPTION
                'Scheduled lab session configuration is immutable'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
    END IF;

    IF NEW.scheduled_start_at < v_event.scheduled_start_at
       OR NEW.scheduled_end_at > v_event.scheduled_end_at THEN
        RAISE EXCEPTION
            'Session schedule must be contained in its event window'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.status = 'scheduled'
       AND OLD.status <> 'scheduled' THEN
        IF v_event.status <> 'scheduled' THEN
            RAISE EXCEPTION
                'A room can be scheduled only when its event is scheduled'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;

        IF NOT session_has_ready_lead(NEW.id) THEN
            RAISE EXCEPTION
                'Session % needs a lead proctor with an active user account',
                NEW.id
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_OP = 'UPDATE'
          AND NEW.status = 'active'
          AND OLD.status <> 'active' THEN
        IF v_event.status NOT IN ('scheduled', 'active')
           OR v_event.manifest_sha256 IS NULL THEN
            RAISE EXCEPTION
                'Session % cannot start before its event package is scheduled',
                NEW.id
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;

        IF clock_timestamp() < v_event.scheduled_start_at
           OR clock_timestamp() >= v_event.scheduled_end_at THEN
            RAISE EXCEPTION
                'Session % can start only inside its event schedule window',
                NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

        IF NOT session_has_ready_lead(NEW.id) THEN
            RAISE EXCEPTION
                'Session % needs a lead proctor with an active user account',
                NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

        NEW.actual_start_at :=
            COALESCE(NEW.actual_start_at, clock_timestamp());
        NEW.actual_end_at := NULL;
    ELSIF TG_OP = 'UPDATE'
          AND NEW.status IN ('completed', 'aborted')
          AND OLD.status <> NEW.status THEN
        NEW.actual_start_at :=
            COALESCE(NEW.actual_start_at, OLD.actual_start_at);
        NEW.actual_end_at :=
            COALESCE(NEW.actual_end_at, clock_timestamp());
    ELSIF TG_OP = 'UPDATE'
          AND NEW.status = 'cancelled'
          AND OLD.status <> 'cancelled' THEN
        IF v_event.status NOT IN ('scheduled', 'cancelled') THEN
            RAISE EXCEPTION
                'Draft sessions are removed by soft-delete; cancellation is for a scheduled event'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        NEW.actual_start_at := NULL;
        NEW.actual_end_at := NULL;
    END IF;

    RETURN NEW;
END;
$$;

-- Event sections and files are mutable only while their event is active draft.
CREATE OR REPLACE FUNCTION guard_exam_event_child_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lab_management, public
AS $$
DECLARE
    v_old_event_id UUID;
    v_new_event_id UUID;
    v_status exam_event_status;
    v_deleted_at TIMESTAMPTZ;
BEGIN
    v_old_event_id := CASE
        WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.exam_event_id
        ELSE NULL
    END;
    v_new_event_id := CASE
        WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.exam_event_id
        ELSE NULL
    END;

    IF v_old_event_id IS NOT NULL THEN
        SELECT status, deleted_at
        INTO v_status, v_deleted_at
        FROM exam_events
        WHERE id = v_old_event_id
        FOR KEY SHARE;

        IF v_status <> 'draft' OR v_deleted_at IS NOT NULL THEN
            RAISE EXCEPTION
                '% rows are frozen once event % leaves active draft',
                TG_TABLE_NAME,
                v_old_event_id
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
    END IF;

    IF v_new_event_id IS NOT NULL
       AND v_new_event_id IS DISTINCT FROM v_old_event_id THEN
        SELECT status, deleted_at
        INTO v_status, v_deleted_at
        FROM exam_events
        WHERE id = v_new_event_id
        FOR KEY SHARE;

        IF NOT FOUND OR v_status <> 'draft' OR v_deleted_at IS NOT NULL THEN
            RAISE EXCEPTION
                '% rows can target only an active draft event',
                TG_TABLE_NAME
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'exam_event_sections'
       AND TG_OP IN ('UPDATE', 'DELETE')
       AND (
            TG_OP = 'DELETE'
            OR NEW.deleted_at IS NOT NULL
            OR NEW.course_section_id IS DISTINCT FROM OLD.course_section_id
       )
       AND EXISTS (
            SELECT 1
            FROM lab_sessions AS ls
            JOIN session_participants AS sp
              ON sp.session_id = ls.id
            WHERE ls.exam_event_id = OLD.exam_event_id
              AND sp.course_section_id = OLD.course_section_id
       ) THEN
        RAISE EXCEPTION
            'Cannot remove event section while room participants reference it'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF TG_TABLE_NAME = 'exam_event_sections'
       AND TG_OP IN ('INSERT', 'UPDATE')
       AND NOT EXISTS (
            SELECT 1
            FROM course_sections AS cs
            WHERE cs.id = NEW.course_section_id
              AND cs.subject_id = NEW.subject_id
              AND cs.deleted_at IS NULL
       ) THEN
        RAISE EXCEPTION 'Event section must reference an active course section'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF TG_TABLE_NAME = 'exam_event_files'
       AND TG_OP IN ('INSERT', 'UPDATE')
       AND NOT EXISTS (
            SELECT 1
            FROM stored_objects AS so
            WHERE so.id = NEW.stored_object_id
              AND so.deleted_at IS NULL
       ) THEN
        RAISE EXCEPTION 'Event file must reference an active stored object'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Proctor and participant assignments are editable only while both the room
-- and its event are draft. This freezes the person schedule at publication.
CREATE OR REPLACE FUNCTION guard_session_assignment_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lab_management, public
AS $$
DECLARE
    v_old_session_id UUID;
    v_new_session_id UUID;
    v_session lab_sessions%ROWTYPE;
    v_event_id UUID;
BEGIN
    v_old_session_id := CASE
        WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.session_id
        ELSE NULL
    END;
    v_new_session_id := CASE
        WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.session_id
        ELSE NULL
    END;

    IF v_old_session_id IS NOT NULL THEN
        SELECT *
        INTO v_session
        FROM lab_sessions
        WHERE id = v_old_session_id
        FOR KEY SHARE;

        IF v_session.status <> 'draft'
           OR v_session.deleted_at IS NOT NULL
           OR NOT EXISTS (
                SELECT 1
                FROM exam_events AS ee
                WHERE ee.id = v_session.exam_event_id
                  AND ee.status = 'draft'
                  AND ee.deleted_at IS NULL
           ) THEN
            RAISE EXCEPTION
                '% assignments are frozen after publication',
                TG_TABLE_NAME
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
    END IF;

    IF v_new_session_id IS NOT NULL
       AND v_new_session_id IS DISTINCT FROM v_old_session_id THEN
        SELECT *
        INTO v_session
        FROM lab_sessions
        WHERE id = v_new_session_id
        FOR KEY SHARE;

        IF NOT FOUND
           OR v_session.status <> 'draft'
           OR v_session.deleted_at IS NOT NULL
           OR NOT EXISTS (
                SELECT 1
                FROM exam_events AS ee
                WHERE ee.id = v_session.exam_event_id
                  AND ee.status = 'draft'
                  AND ee.deleted_at IS NULL
           ) THEN
            RAISE EXCEPTION
                '% assignments can target only an active draft session',
                TG_TABLE_NAME
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        SELECT exam_event_id
        INTO v_event_id
        FROM lab_sessions
        WHERE id = NEW.session_id;

        IF TG_TABLE_NAME = 'session_proctors'
           AND NOT EXISTS (
                SELECT 1
                FROM lecturers AS l
                WHERE l.id = NEW.lecturer_id
                  AND l.deleted_at IS NULL
           ) THEN
            RAISE EXCEPTION 'Proctor must reference an active lecturer'
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF TG_TABLE_NAME = 'session_participants' THEN
            IF NOT EXISTS (
                SELECT 1
                FROM students AS s
                WHERE s.id = NEW.student_id
                  AND s.deleted_at IS NULL
            ) THEN
                RAISE EXCEPTION 'Participant must reference an active student'
                    USING ERRCODE = 'foreign_key_violation';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM exam_event_sections AS ees
                WHERE ees.exam_event_id = v_event_id
                  AND ees.course_section_id = NEW.course_section_id
                  AND ees.deleted_at IS NULL
            ) THEN
                RAISE EXCEPTION
                    'Participant course section is not active in the session event'
                    USING ERRCODE = 'foreign_key_violation';
            END IF;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Keep a published file package stable even if stored_objects is edited.
CREATE OR REPLACE FUNCTION guard_frozen_stored_object()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lab_management, public
AS $$
DECLARE
    v_integrity_change BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_integrity_change := TRUE;
    ELSE
        v_integrity_change := (
            NEW.bucket_name,
            NEW.object_key,
            NEW.object_uri,
            NEW.sha256,
            NEW.size_bytes,
            NEW.deleted_at
        ) IS DISTINCT FROM (
            OLD.bucket_name,
            OLD.object_key,
            OLD.object_uri,
            OLD.sha256,
            OLD.size_bytes,
            OLD.deleted_at
        );
    END IF;

    IF v_integrity_change
       AND EXISTS (
            SELECT 1
            FROM exam_event_files AS eef
            JOIN exam_events AS ee
              ON ee.id = eef.exam_event_id
            WHERE eef.stored_object_id = OLD.id
              AND eef.deleted_at IS NULL
              AND ee.status <> 'draft'
       ) THEN
        RAISE EXCEPTION
            'Stored object % is frozen by a published event manifest',
            OLD.id
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF v_integrity_change
       AND EXISTS (
            SELECT 1
            FROM submission_artifacts AS sa
            WHERE sa.stored_object_id = OLD.id
       ) THEN
        RAISE EXCEPTION
            'Stored object % is frozen by a submission artifact',
            OLD.id
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Guard soft-deleting a master parent that still has an active child.
CREATE OR REPLACE FUNCTION guard_master_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lab_management, public
AS $$
DECLARE
    v_has_child BOOLEAN := FALSE;
BEGIN
    IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL THEN
        RETURN NEW;
    END IF;

    CASE TG_TABLE_NAME
        WHEN 'users' THEN
            v_has_child :=
                EXISTS (
                    SELECT 1 FROM user_roles
                    WHERE user_id = OLD.id AND deleted_at IS NULL
                )
                OR EXISTS (
                    SELECT 1 FROM students
                    WHERE user_id = OLD.id AND deleted_at IS NULL
                )
                OR EXISTS (
                    SELECT 1 FROM lecturers
                    WHERE user_id = OLD.id AND deleted_at IS NULL
                );
        WHEN 'students' THEN
            v_has_child :=
                EXISTS (
                    SELECT 1 FROM course_section_enrollments
                    WHERE student_id = OLD.id AND deleted_at IS NULL
                )
                OR EXISTS (
                    SELECT 1 FROM session_participants
                    WHERE student_id = OLD.id
                );
        WHEN 'lecturers' THEN
            v_has_child := EXISTS (
                SELECT 1 FROM session_proctors
                WHERE lecturer_id = OLD.id
            );
        WHEN 'subjects' THEN
            v_has_child :=
                EXISTS (
                    SELECT 1 FROM course_sections
                    WHERE subject_id = OLD.id AND deleted_at IS NULL
                )
                OR EXISTS (
                    SELECT 1 FROM exam_events
                    WHERE subject_id = OLD.id AND deleted_at IS NULL
                );
        WHEN 'academic_terms' THEN
            v_has_child := EXISTS (
                SELECT 1 FROM course_sections
                WHERE academic_term_id = OLD.id AND deleted_at IS NULL
            );
        WHEN 'course_sections' THEN
            v_has_child :=
                EXISTS (
                    SELECT 1 FROM course_section_enrollments
                    WHERE course_section_id = OLD.id AND deleted_at IS NULL
                )
                OR EXISTS (
                    SELECT 1 FROM exam_event_sections
                    WHERE course_section_id = OLD.id AND deleted_at IS NULL
                )
                OR EXISTS (
                    SELECT 1 FROM session_participants
                    WHERE course_section_id = OLD.id
                );
        WHEN 'labs' THEN
            v_has_child :=
                EXISTS (
                    SELECT 1 FROM workstations
                    WHERE lab_id = OLD.id AND deleted_at IS NULL
                )
                OR EXISTS (
                    SELECT 1 FROM lab_layouts
                    WHERE lab_id = OLD.id AND deleted_at IS NULL
                )
                OR EXISTS (
                    SELECT 1 FROM lab_sessions
                    WHERE lab_id = OLD.id AND deleted_at IS NULL
                );
        WHEN 'workstations' THEN
            v_has_child := EXISTS (
                SELECT 1 FROM lab_seats
                WHERE workstation_id = OLD.id AND deleted_at IS NULL
            );
        WHEN 'lab_layouts' THEN
            v_has_child :=
                EXISTS (
                    SELECT 1 FROM lab_seats
                    WHERE layout_id = OLD.id AND deleted_at IS NULL
                )
                OR EXISTS (
                    SELECT 1 FROM lab_sessions
                    WHERE layout_id = OLD.id AND deleted_at IS NULL
                );
        WHEN 'lab_seats' THEN
            v_has_child := EXISTS (
                SELECT 1 FROM session_participants
                WHERE seat_id = OLD.id
            );
        WHEN 'stored_objects' THEN
            v_has_child :=
                EXISTS (
                    SELECT 1 FROM exam_event_files
                    WHERE stored_object_id = OLD.id AND deleted_at IS NULL
                )
                OR EXISTS (
                    SELECT 1 FROM submission_artifacts
                    WHERE stored_object_id = OLD.id
                );
        WHEN 'exam_events' THEN
            v_has_child :=
                EXISTS (
                    SELECT 1 FROM exam_event_sections
                    WHERE exam_event_id = OLD.id AND deleted_at IS NULL
                )
                OR EXISTS (
                    SELECT 1 FROM exam_event_files
                    WHERE exam_event_id = OLD.id AND deleted_at IS NULL
                )
                OR EXISTS (
                    SELECT 1 FROM lab_sessions
                    WHERE exam_event_id = OLD.id AND deleted_at IS NULL
                );
        WHEN 'lab_sessions' THEN
            v_has_child :=
                EXISTS (
                    SELECT 1 FROM session_proctors
                    WHERE session_id = OLD.id
                )
                OR EXISTS (
                    SELECT 1 FROM session_participants
                    WHERE session_id = OLD.id
                )
                OR EXISTS (
                    SELECT 1 FROM submissions
                    WHERE session_id = OLD.id
                );
        ELSE
            v_has_child := FALSE;
    END CASE;

    IF v_has_child THEN
        RAISE EXCEPTION
            'Cannot soft-delete %.% while active children exist',
            TG_TABLE_NAME,
            OLD.id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- Synchronize one assignment into its materialized booking.
CREATE OR REPLACE FUNCTION sync_assignment_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lab_management, public
AS $$
DECLARE
    v_session lab_sessions%ROWTYPE;
    v_booking_status booking_status;
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- The composite FK's ON DELETE CASCADE removes the booking.
        RETURN OLD;
    END IF;

    SELECT *
    INTO STRICT v_session
    FROM lab_sessions
    WHERE id = NEW.session_id;

    v_booking_status := CASE
        WHEN v_session.status = 'draft' THEN 'tentative'::booking_status
        WHEN v_session.status IN ('scheduled', 'active')
            THEN 'reserved'::booking_status
        ELSE 'released'::booking_status
    END;

    IF TG_TABLE_NAME = 'session_proctors' THEN
        INSERT INTO lecturer_bookings (
            lecturer_id,
            session_id,
            schedule_window,
            booking_status
        )
        VALUES (
            NEW.lecturer_id,
            NEW.session_id,
            v_session.schedule_window,
            v_booking_status
        )
        ON CONFLICT (session_id, lecturer_id)
        DO UPDATE SET
            schedule_window = EXCLUDED.schedule_window,
            booking_status = EXCLUDED.booking_status;
    ELSIF TG_TABLE_NAME = 'session_participants' THEN
        INSERT INTO student_bookings (
            student_id,
            session_id,
            schedule_window,
            booking_status
        )
        VALUES (
            NEW.student_id,
            NEW.session_id,
            v_session.schedule_window,
            v_booking_status
        )
        ON CONFLICT (session_id, student_id)
        DO UPDATE SET
            schedule_window = EXCLUDED.schedule_window,
            booking_status = EXCLUDED.booking_status;
    END IF;

    RETURN NEW;
END;
$$;

-- Synchronize all person bookings after a session schedule/status change.
CREATE OR REPLACE FUNCTION sync_session_bookings()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lab_management, public
AS $$
DECLARE
    v_booking_status booking_status;
BEGIN
    v_booking_status := CASE
        WHEN NEW.status = 'draft' THEN 'tentative'::booking_status
        WHEN NEW.status IN ('scheduled', 'active')
            THEN 'reserved'::booking_status
        ELSE 'released'::booking_status
    END;

    UPDATE lecturer_bookings
    SET schedule_window = NEW.schedule_window,
        booking_status = v_booking_status
    WHERE session_id = NEW.id;

    UPDATE student_bookings
    SET schedule_window = NEW.schedule_window,
        booking_status = v_booking_status
    WHERE session_id = NEW.id;

    RETURN NEW;
END;
$$;

-- Write status history in the same transaction as the aggregate change.
CREATE OR REPLACE FUNCTION record_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lab_management, public
AS $$
DECLARE
    v_actor_type actor_type;
    v_changed_by UUID;
    v_command_id UUID;
    v_reason TEXT;
    v_actor_setting TEXT;
    v_user_setting TEXT;
    v_command_setting TEXT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    v_actor_setting :=
        NULLIF(current_setting('app.actor_type', TRUE), '');
    v_user_setting :=
        NULLIF(current_setting('app.current_user_id', TRUE), '');
    v_command_setting :=
        NULLIF(current_setting('app.command_id', TRUE), '');

    v_actor_type := COALESCE(
        v_actor_setting::actor_type,
        CASE
            WHEN v_user_setting IS NULL THEN 'system'::actor_type
            ELSE 'user'::actor_type
        END
    );

    IF v_actor_type = 'user' THEN
        IF v_user_setting IS NULL THEN
            RAISE EXCEPTION
                'app.current_user_id is required for actor_type=user'
                USING ERRCODE = 'check_violation';
        END IF;
        v_changed_by := v_user_setting::UUID;
    ELSE
        v_changed_by := NULL;
    END IF;

    v_command_id :=
        COALESCE(v_command_setting::UUID, gen_random_uuid());
    v_reason := COALESCE(
        NULLIF(current_setting('app.status_change_reason', TRUE), ''),
        CASE
            WHEN TG_OP = 'INSERT' THEN 'created'
            ELSE format(
                'status_transition:%s->%s',
                OLD.status,
                NEW.status
            )
        END
    );

    IF TG_TABLE_NAME = 'exam_events' THEN
        INSERT INTO exam_event_status_history (
            exam_event_id,
            from_status,
            to_status,
            reason,
            actor_type,
            changed_by,
            command_id
        )
        VALUES (
            NEW.id,
            CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
            NEW.status,
            v_reason,
            v_actor_type,
            v_changed_by,
            v_command_id
        );
    ELSIF TG_TABLE_NAME = 'lab_sessions' THEN
        INSERT INTO session_status_history (
            session_id,
            from_status,
            to_status,
            reason,
            actor_type,
            changed_by,
            command_id
        )
        VALUES (
            NEW.id,
            CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
            NEW.status,
            v_reason,
            v_actor_type,
            v_changed_by,
            v_command_id
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Event publication/cancellation/abort drives room states. It does not mark
-- an event active; room activation does that in reconcile_event_from_sessions.
CREATE OR REPLACE FUNCTION cascade_event_status_to_sessions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lab_management, public
AS $$
DECLARE
    v_old_actor TEXT;
    v_old_user TEXT;
    v_old_reason TEXT;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    v_old_actor := current_setting('app.actor_type', TRUE);
    v_old_user := current_setting('app.current_user_id', TRUE);
    v_old_reason := current_setting('app.status_change_reason', TRUE);

    PERFORM set_config('app.actor_type', 'system', TRUE);
    PERFORM set_config('app.current_user_id', '', TRUE);

    IF NEW.status = 'scheduled' THEN
        PERFORM set_config(
            'app.status_change_reason',
            'event_scheduled',
            TRUE
        );
        UPDATE lab_sessions
        SET status = 'scheduled'
        WHERE exam_event_id = NEW.id
          AND deleted_at IS NULL
          AND status = 'draft';
    ELSIF NEW.status = 'cancelled' THEN
        PERFORM set_config(
            'app.status_change_reason',
            'event_cancelled_before_start',
            TRUE
        );
        UPDATE lab_sessions
        SET status = 'cancelled'
        WHERE exam_event_id = NEW.id
          AND deleted_at IS NULL
          AND status IN ('draft', 'scheduled');
    ELSIF NEW.status = 'aborted' THEN
        PERFORM set_config(
            'app.status_change_reason',
            'event_aborted_after_start',
            TRUE
        );
        UPDATE lab_sessions
        SET status = 'aborted'
        WHERE exam_event_id = NEW.id
          AND deleted_at IS NULL
          AND status = 'active';

        UPDATE lab_sessions
        SET status = 'cancelled'
        WHERE exam_event_id = NEW.id
          AND deleted_at IS NULL
          AND status IN ('draft', 'scheduled');
    END IF;

    PERFORM set_config(
        'app.actor_type',
        COALESCE(v_old_actor, ''),
        TRUE
    );
    PERFORM set_config(
        'app.current_user_id',
        COALESCE(v_old_user, ''),
        TRUE
    );
    PERFORM set_config(
        'app.status_change_reason',
        COALESCE(v_old_reason, ''),
        TRUE
    );

    RETURN NEW;
END;
$$;

-- The event becomes active when the first room starts and remains active even
-- if no room is currently active, until every room is terminal.
CREATE OR REPLACE FUNCTION reconcile_event_from_sessions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lab_management, public
AS $$
DECLARE
    v_event exam_events%ROWTYPE;
    v_total BIGINT;
    v_nonterminal BIGINT;
    v_all_cancelled BOOLEAN;
    v_any_aborted BOOLEAN;
    v_any_completed BOOLEAN;
    v_target exam_event_status;
    v_reason TEXT;
    v_old_actor TEXT;
    v_old_user TEXT;
    v_old_reason TEXT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    SELECT *
    INTO v_event
    FROM exam_events
    WHERE id = NEW.exam_event_id
    FOR UPDATE;

    IF v_event.status IN ('completed', 'cancelled', 'aborted') THEN
        RETURN NEW;
    END IF;

    v_old_actor := current_setting('app.actor_type', TRUE);
    v_old_user := current_setting('app.current_user_id', TRUE);
    v_old_reason := current_setting('app.status_change_reason', TRUE);

    IF NEW.status = 'active' AND v_event.status = 'scheduled' THEN
        PERFORM set_config('app.actor_type', 'system', TRUE);
        PERFORM set_config('app.current_user_id', '', TRUE);
        PERFORM set_config(
            'app.status_change_reason',
            'first_lab_session_active',
            TRUE
        );

        UPDATE exam_events
        SET status = 'active',
            actual_start_at = NEW.actual_start_at
        WHERE id = NEW.exam_event_id
          AND status = 'scheduled';

        v_event.status := 'active';
        v_event.actual_start_at := NEW.actual_start_at;
    END IF;

    SELECT
        count(*),
        count(*) FILTER (
            WHERE status NOT IN ('completed', 'cancelled', 'aborted')
        ),
        COALESCE(bool_and(status = 'cancelled'), FALSE),
        COALESCE(bool_or(status = 'aborted'), FALSE),
        COALESCE(bool_or(status = 'completed'), FALSE)
    INTO
        v_total,
        v_nonterminal,
        v_all_cancelled,
        v_any_aborted,
        v_any_completed
    FROM lab_sessions
    WHERE exam_event_id = NEW.exam_event_id
      AND deleted_at IS NULL;

    IF v_total > 0
       AND v_nonterminal = 0
       AND v_event.status IN ('scheduled', 'active') THEN
        IF v_all_cancelled THEN
            v_target := 'cancelled';
            v_reason := 'all_lab_sessions_cancelled';
        ELSIF v_any_aborted THEN
            v_target := 'aborted';
            v_reason := 'one_or_more_lab_sessions_aborted';
        ELSIF v_any_completed THEN
            v_target := 'completed';
            v_reason := 'all_lab_sessions_terminal';
        END IF;

        IF v_target IS NOT NULL THEN
            PERFORM set_config('app.actor_type', 'system', TRUE);
            PERFORM set_config('app.current_user_id', '', TRUE);
            PERFORM set_config(
                'app.status_change_reason',
                v_reason,
                TRUE
            );

            UPDATE exam_events
            SET status = v_target
            WHERE id = NEW.exam_event_id
              AND status = v_event.status;
        END IF;
    END IF;

    PERFORM set_config(
        'app.actor_type',
        COALESCE(v_old_actor, ''),
        TRUE
    );
    PERFORM set_config(
        'app.current_user_id',
        COALESCE(v_old_user, ''),
        TRUE
    );
    PERFORM set_config(
        'app.status_change_reason',
        COALESCE(v_old_reason, ''),
        TRUE
    );

    RETURN NEW;
END;
$$;

-- Active-row uniqueness for soft-deleted entities.
CREATE UNIQUE INDEX uq_users_username_active
    ON users (username)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_users_email_active
    ON users (email)
    WHERE deleted_at IS NULL AND email IS NOT NULL;

CREATE UNIQUE INDEX uq_user_roles_active
    ON user_roles (user_id, role_id)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_students_user_active
    ON students (user_id)
    WHERE deleted_at IS NULL AND user_id IS NOT NULL;

CREATE UNIQUE INDEX uq_students_code_active
    ON students (student_code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_lecturers_user_active
    ON lecturers (user_id)
    WHERE deleted_at IS NULL AND user_id IS NOT NULL;

CREATE UNIQUE INDEX uq_lecturers_code_active
    ON lecturers (employee_code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_subjects_code_active
    ON subjects (code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_academic_terms_code_active
    ON academic_terms (code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_course_sections_active
    ON course_sections (
        academic_term_id,
        subject_id,
        section_code
    )
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_course_section_enrollments_active
    ON course_section_enrollments (course_section_id, student_id)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_labs_code_active
    ON labs (code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_workstations_asset_code_active
    ON workstations (asset_code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_workstations_hostname_active
    ON workstations (lab_id, hostname)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_workstations_mac_active
    ON workstations (mac_address)
    WHERE deleted_at IS NULL AND mac_address IS NOT NULL;

CREATE UNIQUE INDEX uq_lab_layouts_version_active
    ON lab_layouts (lab_id, version_no)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_lab_layouts_one_active
    ON lab_layouts (lab_id)
    WHERE deleted_at IS NULL AND is_active;

-- Seat/workstation uniqueness is deliberately scoped to a layout only.
CREATE UNIQUE INDEX uq_lab_seats_code_active
    ON lab_seats (layout_id, seat_code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_lab_seats_workstation_active
    ON lab_seats (layout_id, workstation_id)
    WHERE deleted_at IS NULL AND workstation_id IS NOT NULL;

CREATE UNIQUE INDEX uq_stored_objects_location_active
    ON stored_objects (bucket_name, object_key)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_stored_objects_uri_active
    ON stored_objects (object_uri)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_exam_events_code_active
    ON exam_events (code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_exam_event_sections_active
    ON exam_event_sections (exam_event_id, course_section_id)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_exam_event_files_object_active
    ON exam_event_files (exam_event_id, stored_object_id)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_exam_event_files_order_active
    ON exam_event_files (exam_event_id, file_role, sort_order)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_lab_sessions_code_active
    ON lab_sessions (code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_session_proctors_lead
    ON session_proctors (session_id)
    WHERE role = 'lead';

CREATE UNIQUE INDEX uq_session_participants_seat
    ON session_participants (session_id, seat_id)
    WHERE seat_id IS NOT NULL;

CREATE UNIQUE INDEX uq_submissions_attempt
    ON submissions (participant_id, attempt_no);

CREATE UNIQUE INDEX uq_submissions_final_effective
    ON submissions (participant_id)
    WHERE is_final
      AND status NOT IN ('revoked', 'superseded');

CREATE UNIQUE INDEX uq_submission_artifacts_object
    ON submission_artifacts (submission_id, stored_object_id);

CREATE UNIQUE INDEX uq_submission_artifacts_version
    ON submission_artifacts (submission_id, kind, version_no);

CREATE UNIQUE INDEX uq_submission_artifacts_current
    ON submission_artifacts (submission_id, kind)
    WHERE is_current;

-- Foreign-key, filtering, search and reporting indexes.
CREATE INDEX idx_user_roles_role
    ON user_roles (role_id, user_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_students_name_trgm
    ON students USING gin (full_name gin_trgm_ops)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_students_class
    ON students (class_code, student_code)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_lecturers_name_trgm
    ON lecturers USING gin (full_name gin_trgm_ops)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_subjects_name_trgm
    ON subjects USING gin (name gin_trgm_ops)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_academic_terms_dates
    ON academic_terms (starts_on, ends_on)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_course_sections_subject
    ON course_sections (subject_id, academic_term_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_course_sections_term
    ON course_sections (academic_term_id, section_code)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_course_section_enrollments_student
    ON course_section_enrollments (student_id, course_section_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_labs_name_trgm
    ON labs USING gin (name gin_trgm_ops)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_workstations_lab
    ON workstations (lab_id, is_enabled)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_lab_layouts_lab
    ON lab_layouts (lab_id, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_lab_seats_lab_workstation
    ON lab_seats (lab_id, workstation_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_stored_objects_sha256
    ON stored_objects (sha256)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_stored_objects_uploaded_by
    ON stored_objects (uploaded_by, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_exam_events_subject_schedule
    ON exam_events (subject_id, scheduled_start_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_exam_events_status_schedule
    ON exam_events (status, scheduled_start_at)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_exam_events_created_by
    ON exam_events (created_by, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_exam_event_sections_section
    ON exam_event_sections (course_section_id, exam_event_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_exam_event_sections_subject
    ON exam_event_sections (subject_id, exam_event_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_exam_event_files_object
    ON exam_event_files (stored_object_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_lab_sessions_event
    ON lab_sessions (exam_event_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_lab_sessions_lab_schedule
    ON lab_sessions (lab_id, scheduled_start_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_lab_sessions_status_schedule
    ON lab_sessions (status, scheduled_start_at)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_lab_sessions_created_by
    ON lab_sessions (created_by, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_session_proctors_lecturer
    ON session_proctors (lecturer_id, session_id);

CREATE INDEX idx_session_proctors_assigned_by
    ON session_proctors (assigned_by)
    WHERE assigned_by IS NOT NULL;

CREATE INDEX idx_session_participants_student
    ON session_participants (student_id, session_id);

CREATE INDEX idx_session_participants_section
    ON session_participants (course_section_id, session_id);

CREATE INDEX idx_session_participants_status
    ON session_participants (session_id, status);

CREATE INDEX idx_session_participants_seat
    ON session_participants (seat_id)
    WHERE seat_id IS NOT NULL;

CREATE INDEX idx_lecturer_bookings_session
    ON lecturer_bookings (session_id, lecturer_id);

CREATE INDEX idx_lecturer_bookings_person_status
    ON lecturer_bookings (lecturer_id, booking_status);

CREATE INDEX idx_student_bookings_session
    ON student_bookings (session_id, student_id);

CREATE INDEX idx_student_bookings_person_status
    ON student_bookings (student_id, booking_status);

CREATE INDEX idx_exam_event_status_history_event
    ON exam_event_status_history (exam_event_id, created_at DESC);

CREATE INDEX idx_exam_event_status_history_actor
    ON exam_event_status_history (changed_by, created_at DESC)
    WHERE changed_by IS NOT NULL;

CREATE INDEX idx_exam_event_status_history_command
    ON exam_event_status_history (command_id, created_at);

CREATE INDEX idx_session_status_history_session
    ON session_status_history (session_id, created_at DESC);

CREATE INDEX idx_session_status_history_actor
    ON session_status_history (changed_by, created_at DESC)
    WHERE changed_by IS NOT NULL;

CREATE INDEX idx_session_status_history_command
    ON session_status_history (command_id, created_at);

CREATE INDEX idx_submissions_session_time
    ON submissions (session_id, submitted_at DESC);

CREATE INDEX idx_submissions_status
    ON submissions (status, submitted_at DESC);

CREATE INDEX idx_submissions_received_by
    ON submissions (received_by, submitted_at DESC)
    WHERE received_by IS NOT NULL;

CREATE INDEX idx_submission_artifacts_object
    ON submission_artifacts (stored_object_id);

CREATE INDEX idx_audit_logs_actor_time
    ON audit_logs (actor_user_id, occurred_at DESC)
    WHERE actor_user_id IS NOT NULL;

CREATE INDEX idx_audit_logs_entity_time
    ON audit_logs (entity_type, entity_id, occurred_at DESC);

CREATE INDEX idx_audit_logs_action_time
    ON audit_logs (action, occurred_at DESC);

CREATE INDEX idx_audit_logs_request
    ON audit_logs (request_id)
    WHERE request_id IS NOT NULL;

CREATE INDEX idx_audit_logs_command
    ON audit_logs (command_id, occurred_at DESC);

CREATE INDEX idx_audit_logs_changes_gin
    ON audit_logs USING gin (changes jsonb_path_ops);

-- Lifecycle triggers. Prefixes document and enforce trigger order.
CREATE TRIGGER trg_10_exam_events_validate_lifecycle
BEFORE INSERT OR UPDATE ON exam_events
FOR EACH ROW EXECUTE FUNCTION validate_exam_event_lifecycle();

CREATE TRIGGER trg_10_lab_sessions_validate_lifecycle
BEFORE INSERT OR UPDATE ON lab_sessions
FOR EACH ROW EXECUTE FUNCTION validate_lab_session_lifecycle();

CREATE TRIGGER trg_10_exam_event_sections_guard
BEFORE INSERT OR UPDATE OR DELETE ON exam_event_sections
FOR EACH ROW EXECUTE FUNCTION guard_exam_event_child_mutation();

CREATE TRIGGER trg_10_exam_event_files_guard
BEFORE INSERT OR UPDATE OR DELETE ON exam_event_files
FOR EACH ROW EXECUTE FUNCTION guard_exam_event_child_mutation();

CREATE TRIGGER trg_10_session_proctors_guard
BEFORE INSERT OR UPDATE OR DELETE ON session_proctors
FOR EACH ROW EXECUTE FUNCTION guard_session_assignment_mutation();

CREATE TRIGGER trg_10_session_participants_guard
BEFORE INSERT OR UPDATE OR DELETE ON session_participants
FOR EACH ROW EXECUTE FUNCTION guard_session_assignment_mutation();

CREATE TRIGGER trg_10_stored_objects_frozen_guard
BEFORE UPDATE OR DELETE ON stored_objects
FOR EACH ROW EXECUTE FUNCTION guard_frozen_stored_object();

-- Parent soft-delete guards.
DO $$
DECLARE
    v_table_name TEXT;
BEGIN
    FOREACH v_table_name IN ARRAY ARRAY[
        'users',
        'students',
        'lecturers',
        'subjects',
        'academic_terms',
        'course_sections',
        'labs',
        'workstations',
        'lab_layouts',
        'lab_seats',
        'stored_objects',
        'exam_events',
        'lab_sessions'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I '
            || 'BEFORE UPDATE OF deleted_at ON %I '
            || 'FOR EACH ROW EXECUTE FUNCTION guard_master_soft_delete()',
            'trg_20_' || v_table_name || '_soft_delete_guard',
            v_table_name
        );
    END LOOP;
END;
$$;

-- Database-managed updated_at for mutable, non-versioned tables.
DO $$
DECLARE
    v_table_name TEXT;
BEGIN
    FOREACH v_table_name IN ARRAY ARRAY[
        'roles',
        'users',
        'user_roles',
        'students',
        'lecturers',
        'subjects',
        'academic_terms',
        'course_sections',
        'course_section_enrollments',
        'labs',
        'workstations',
        'lab_layouts',
        'lab_seats',
        'stored_objects',
        'exam_event_sections',
        'exam_event_files',
        'session_proctors',
        'session_participants',
        'lecturer_bookings',
        'student_bookings',
        'submissions',
        'submission_artifacts'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I '
            || 'BEFORE UPDATE ON %I '
            || 'FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            'trg_90_' || v_table_name || '_updated_at',
            v_table_name
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_90_exam_events_updated_at
BEFORE UPDATE ON exam_events
FOR EACH ROW EXECUTE FUNCTION set_versioned_updated_at();

CREATE TRIGGER trg_90_lab_sessions_updated_at
BEFORE UPDATE ON lab_sessions
FOR EACH ROW EXECUTE FUNCTION set_versioned_updated_at();

-- Booking synchronization.
CREATE TRIGGER trg_50_session_proctors_sync_booking
AFTER INSERT OR UPDATE OR DELETE ON session_proctors
FOR EACH ROW EXECUTE FUNCTION sync_assignment_booking();

CREATE TRIGGER trg_50_session_participants_sync_booking
AFTER INSERT OR UPDATE OR DELETE ON session_participants
FOR EACH ROW EXECUTE FUNCTION sync_assignment_booking();

CREATE TRIGGER trg_50_lab_sessions_sync_bookings
AFTER INSERT OR UPDATE OF status, scheduled_start_at, scheduled_end_at
ON lab_sessions
FOR EACH ROW EXECUTE FUNCTION sync_session_bookings();

-- Status history and aggregate reconciliation.
CREATE TRIGGER trg_40_exam_events_status_history
AFTER INSERT OR UPDATE OF status ON exam_events
FOR EACH ROW EXECUTE FUNCTION record_status_history();

CREATE TRIGGER trg_60_exam_events_cascade_status
AFTER UPDATE OF status ON exam_events
FOR EACH ROW EXECUTE FUNCTION cascade_event_status_to_sessions();

CREATE TRIGGER trg_40_lab_sessions_status_history
AFTER INSERT OR UPDATE OF status ON lab_sessions
FOR EACH ROW EXECUTE FUNCTION record_status_history();

CREATE TRIGGER trg_70_lab_sessions_reconcile_event
AFTER INSERT OR UPDATE OF status ON lab_sessions
FOR EACH ROW EXECUTE FUNCTION reconcile_event_from_sessions();

-- Append-only guards.
CREATE TRIGGER trg_exam_event_status_history_immutable
BEFORE UPDATE OR DELETE ON exam_event_status_history
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TRIGGER trg_session_status_history_immutable
BEFORE UPDATE OR DELETE ON session_status_history
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

INSERT INTO roles (code, name, description, is_system)
VALUES
    ('admin', 'Administrator', 'Quản trị toàn hệ thống', TRUE),
    ('operator', 'Lab operator', 'Quản trị phòng máy và lịch', TRUE),
    ('lecturer', 'Lecturer', 'Giảng viên hoặc cán bộ coi thi', TRUE),
    ('student', 'Student', 'Sinh viên tham gia ca thi hoặc thực hành', TRUE)
ON CONFLICT (code) DO NOTHING;

COMMIT;
