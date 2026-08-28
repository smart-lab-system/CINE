export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["HealthController_check"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController_register"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController_login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController_refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController_logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/accounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AccountsController_search"];
        put?: never;
        post: operations["AccountsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/accounts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AccountsController_findOne"];
        put?: never;
        post?: never;
        delete: operations["AccountsController_remove"];
        options?: never;
        head?: never;
        patch: operations["AccountsController_update"];
        trace?: never;
    };
    "/subjects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["SubjectsController_search"];
        put?: never;
        post: operations["SubjectsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/subjects/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["SubjectsController_findOne"];
        put?: never;
        post?: never;
        delete: operations["SubjectsController_remove"];
        options?: never;
        head?: never;
        patch: operations["SubjectsController_update"];
        trace?: never;
    };
    "/academic-terms": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AcademicTermsController_search"];
        put?: never;
        post: operations["AcademicTermsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/academic-terms/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AcademicTermsController_findOne"];
        put?: never;
        post?: never;
        delete: operations["AcademicTermsController_remove"];
        options?: never;
        head?: never;
        patch: operations["AcademicTermsController_update"];
        trace?: never;
    };
    "/students": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["StudentsController_search"];
        put?: never;
        post: operations["StudentsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/students/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["StudentsController_findOne"];
        put?: never;
        post?: never;
        delete: operations["StudentsController_remove"];
        options?: never;
        head?: never;
        patch: operations["StudentsController_update"];
        trace?: never;
    };
    "/lecturers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LecturersController_search"];
        put?: never;
        post: operations["LecturersController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/lecturers/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LecturersController_findOne"];
        put?: never;
        post?: never;
        delete: operations["LecturersController_remove"];
        options?: never;
        head?: never;
        patch: operations["LecturersController_update"];
        trace?: never;
    };
    "/course-sections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["CourseSectionsController_search"];
        put?: never;
        post: operations["CourseSectionsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/course-sections/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["CourseSectionsController_findOne"];
        put?: never;
        post?: never;
        delete: operations["CourseSectionsController_remove"];
        options?: never;
        head?: never;
        patch: operations["CourseSectionsController_update"];
        trace?: never;
    };
    "/course-sections/{id}/enrollments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["CourseSectionsController_listEnrollments"];
        put?: never;
        post: operations["CourseSectionsController_enroll"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/course-sections/{id}/enrollments/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["CourseSectionsController_bulkEnroll"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/course-sections/{id}/enrollments/{enrollmentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["CourseSectionsController_unenroll"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/labs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LabsController_search"];
        put?: never;
        post: operations["LabsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/labs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LabsController_findOne"];
        put?: never;
        post?: never;
        delete: operations["LabsController_remove"];
        options?: never;
        head?: never;
        patch: operations["LabsController_update"];
        trace?: never;
    };
    "/lab-room-proposals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LabRoomProposalsController_search"];
        put?: never;
        post: operations["LabRoomProposalsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/lab-room-proposals/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LabRoomProposalsController_findOne"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/labs/{labId}/workstations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["WorkstationsController_search"];
        put?: never;
        post: operations["WorkstationsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/labs/{labId}/workstations/batch-rename": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["WorkstationsController_batchRename"];
        trace?: never;
    };
    "/labs/{labId}/workstations/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["WorkstationsController_findOne"];
        put?: never;
        post?: never;
        delete: operations["WorkstationsController_remove"];
        options?: never;
        head?: never;
        patch: operations["WorkstationsController_update"];
        trace?: never;
    };
    "/labs/{labId}/layouts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LayoutsController_search"];
        put?: never;
        post: operations["LayoutsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/labs/{labId}/layouts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LayoutsController_findOne"];
        put?: never;
        post?: never;
        delete: operations["LayoutsController_remove"];
        options?: never;
        head?: never;
        patch: operations["LayoutsController_update"];
        trace?: never;
    };
    "/labs/{labId}/layouts/{id}/activate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["LayoutsController_activate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/labs/{labId}/layouts/{id}/apply-template": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["LayoutsController_applyTemplate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/labs/{labId}/layouts/{id}/seats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["LayoutsController_bulkUpsertSeats"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/labs/{labId}/layouts/{id}/seats/{seatId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["LayoutsController_removeSeat"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/seating-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["SeatingTemplatesController_search"];
        put?: never;
        post: operations["SeatingTemplatesController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/seating-templates/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["SeatingTemplatesController_findOne"];
        put?: never;
        post?: never;
        delete: operations["SeatingTemplatesController_remove"];
        options?: never;
        head?: never;
        patch: operations["SeatingTemplatesController_update"];
        trace?: never;
    };
    "/exam-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ExamEventsController_search"];
        put?: never;
        post: operations["ExamEventsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exam-events/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ExamEventsController_findOne"];
        put?: never;
        post?: never;
        delete: operations["ExamEventsController_remove"];
        options?: never;
        head?: never;
        patch: operations["ExamEventsController_update"];
        trace?: never;
    };
    "/exam-events/{id}/sections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ExamEventsController_attachSection"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exam-events/{id}/sections/{sectionLinkId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["ExamEventsController_removeSection"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exam-events/{id}/files": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ExamEventsController_attachFile"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exam-events/{id}/files/{fileId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["ExamEventsController_removeFile"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exam-events/{id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ExamEventsController_transitionStatus"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exam-events/{id}/status-history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ExamEventsController_listStatusHistory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exam-events/{id}/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LabSessionsController_search"];
        put?: never;
        post: operations["LabSessionsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exam-events/{id}/sessions/{sessionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LabSessionsController_findOne"];
        put?: never;
        post?: never;
        delete: operations["LabSessionsController_remove"];
        options?: never;
        head?: never;
        patch: operations["LabSessionsController_update"];
        trace?: never;
    };
    "/exam-events/{id}/sessions/{sessionId}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["LabSessionsController_transitionStatus"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exam-events/{id}/sessions/{sessionId}/status-history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LabSessionsController_listStatusHistory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exam-events/{id}/sessions/{sessionId}/proctors": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["LabSessionsController_addProctor"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exam-events/{id}/sessions/{sessionId}/proctors/{proctorId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["LabSessionsController_removeProctor"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exam-events/{id}/sessions/{sessionId}/participants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LabSessionsController_listParticipants"];
        put?: never;
        post: operations["LabSessionsController_addParticipant"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exam-events/{id}/sessions/{sessionId}/participants/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["LabSessionsController_bulkAddParticipants"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exam-events/{id}/sessions/{sessionId}/participants/{participantId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["LabSessionsController_removeParticipant"];
        options?: never;
        head?: never;
        patch: operations["LabSessionsController_updateParticipant"];
        trace?: never;
    };
    "/stored-objects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["StoredObjectsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        RegisterDto: {
            username: string;
            email?: string;
            password: string;
            displayName: string;
        };
        LoginDto: {
            username: string;
            password: string;
        };
        CreateAccountDto: {
            username: string;
            email?: string;
            password: string;
            displayName: string;
            roleCodes: string[];
        };
        UpdateAccountDto: {
            email?: string;
            displayName?: string;
            /** @enum {string} */
            status?: "pending" | "active" | "locked" | "disabled";
            roleCodes?: string[];
        };
        CreateSubjectDto: {
            code: string;
            name: string;
            credits?: number;
            description?: string;
        };
        CreateSubjectResponseDto: {
            id: string;
        };
        SubjectViewDto: {
            id: string;
            code: string;
            name: string;
            credits: number | null;
            description: string | null;
        };
        SubjectsListResponseDto: {
            items: components["schemas"]["SubjectViewDto"][];
            total: number;
        };
        UpdateSubjectDto: {
            name?: string;
            credits?: number | null;
            description?: string | null;
        };
        CreateAcademicTermDto: {
            code: string;
            name: string;
            startsOn: string;
            endsOn: string;
            isActive?: boolean;
        };
        CreateAcademicTermResponseDto: {
            id: string;
        };
        AcademicTermViewDto: {
            id: string;
            code: string;
            name: string;
            startsOn: string;
            endsOn: string;
            isActive: boolean;
        };
        AcademicTermsListResponseDto: {
            items: components["schemas"]["AcademicTermViewDto"][];
            total: number;
        };
        UpdateAcademicTermDto: {
            name?: string;
            startsOn?: string;
            endsOn?: string;
            isActive?: boolean;
        };
        CreateStudentDto: {
            studentCode: string;
            fullName: string;
            userId?: string;
            /** @enum {string} */
            status?: "active" | "graduated";
        };
        CreateStudentResponseDto: {
            id: string;
        };
        StudentViewDto: {
            id: string;
            userId: string | null;
            studentCode: string;
            fullName: string;
            /** @enum {string} */
            status: "active" | "graduated";
        };
        StudentsListResponseDto: {
            items: components["schemas"]["StudentViewDto"][];
            total: number;
        };
        UpdateStudentDto: {
            fullName?: string;
            userId?: string | null;
            /** @enum {string} */
            status?: "active" | "graduated";
        };
        CreateLecturerDto: {
            employeeCode: string;
            fullName: string;
            userId?: string;
            department?: string;
            academicTitle?: string;
            email?: string;
            phone?: string;
        };
        CreateLecturerResponseDto: {
            id: string;
        };
        LecturerViewDto: {
            id: string;
            userId: string | null;
            employeeCode: string;
            fullName: string;
            department: string | null;
            academicTitle: string | null;
            email: string | null;
            phone: string | null;
        };
        LecturersListResponseDto: {
            items: components["schemas"]["LecturerViewDto"][];
            total: number;
        };
        UpdateLecturerDto: {
            fullName?: string;
            userId?: string | null;
            department?: string | null;
            academicTitle?: string | null;
            email?: string | null;
            phone?: string | null;
        };
        CreateCourseSectionDto: {
            subjectId: string;
            academicTermId: string;
            sectionCode: string;
            nominalClassCode?: string;
            name?: string;
            lecturerId?: string;
            maxEnrollment?: number;
        };
        CreateCourseSectionResponseDto: {
            id: string;
        };
        CourseSectionViewDto: {
            id: string;
            subjectId: string;
            subjectCode: string;
            subjectName: string;
            academicTermId: string;
            termCode: string;
            termName: string;
            sectionCode: string;
            nominalClassCode: string | null;
            name: string | null;
            lecturerId: string | null;
            lecturerCode: string | null;
            lecturerName: string | null;
            maxEnrollment: number | null;
        };
        CourseSectionsListResponseDto: {
            items: components["schemas"]["CourseSectionViewDto"][];
            total: number;
        };
        UpdateCourseSectionDto: {
            nominalClassCode?: string | null;
            name?: string | null;
            lecturerId?: string | null;
            maxEnrollment?: number | null;
        };
        EnrollmentViewDto: {
            id: string;
            courseSectionId: string;
            studentId: string;
            studentCode: string;
            fullName: string;
            /** @enum {string} */
            status: "active" | "dropped" | "withdrawn";
            enrolledAt: string;
        };
        EnrollmentsListResponseDto: {
            items: components["schemas"]["EnrollmentViewDto"][];
            total: number;
        };
        EnrollStudentDto: {
            studentId: string;
        };
        CreateEnrollmentResponseDto: {
            id: string;
        };
        BulkEnrollStudentsDto: {
            studentIds: string[];
        };
        BulkEnrollResponseDto: {
            ids: string[];
        };
        CreateLabDto: {
            code: string;
            name: string;
            building?: string;
            floor?: string;
            capacity: number;
            description?: string;
            isActive?: boolean;
        };
        CreateLabResponseDto: {
            id: string;
        };
        LabViewDto: {
            id: string;
            code: string;
            name: string;
            building: string | null;
            floor: string | null;
            capacity: number;
            description: string | null;
            isActive: boolean;
        };
        LabsListResponseDto: {
            items: components["schemas"]["LabViewDto"][];
            total: number;
        };
        LabRoomProposalDeviceDto: {
            /** @enum {string} */
            role: "tutor" | "client";
            machineId: string;
            hostname: string;
            macAddress?: string;
            osEdition?: string;
            osVersion?: string;
            serial?: string;
            ipv4?: string;
            username?: string;
        };
        CreateLabRoomProposalDto: {
            roomCode: string;
            roomName: string;
            building?: string;
            floor?: string;
            devices: components["schemas"]["LabRoomProposalDeviceDto"][];
        };
        CreateLabRoomProposalResponseDto: {
            id: string;
        };
        LabRoomProposalDeviceViewDto: {
            /** @enum {string} */
            role: "tutor" | "client";
            machineId: string;
            hostname: string;
            macAddress: string;
            osEdition: string;
            osVersion: string;
            serial: string;
            ipv4?: string;
            username?: string;
        };
        LabRoomProposalViewDto: {
            id: string;
            roomCode: string;
            roomName: string;
            building: string | null;
            floor: string | null;
            devices: components["schemas"]["LabRoomProposalDeviceViewDto"][];
            submittedBy: string | null;
            submittedByName: string | null;
            createdAt: string;
        };
        LabRoomProposalsListResponseDto: {
            items: components["schemas"]["LabRoomProposalViewDto"][];
            total: number;
        };
        UpdateLabDto: {
            name?: string;
            building?: string | null;
            floor?: string | null;
            capacity?: number;
            description?: string | null;
            isActive?: boolean;
        };
        CreateWorkstationDto: {
            assetCode: string;
            hostname: string;
            macAddress?: string;
            staticIpAddress?: string;
            serialNumber?: string;
            operatingSystem?: string;
            isEnabled?: boolean;
            /** @enum {string} */
            type?: "master" | "client";
            /** @enum {string} */
            status?: "available" | "maintenance" | "broken" | "retired";
            notes?: string;
        };
        CreateWorkstationResponseDto: {
            id: string;
        };
        WorkstationViewDto: {
            id: string;
            labId: string;
            agentId: string;
            assetCode: string;
            hostname: string;
            macAddress: string | null;
            staticIpAddress: string | null;
            serialNumber: string | null;
            operatingSystem: string | null;
            isEnabled: boolean;
            /**
             * @default client
             * @enum {string}
             */
            type: "master" | "client";
            /** @enum {string} */
            status: "available" | "maintenance" | "broken" | "retired";
            notes: string | null;
        };
        WorkstationsListResponseDto: {
            items: components["schemas"]["WorkstationViewDto"][];
            total: number;
        };
        BatchRenameWorkstationItemDto: {
            id: string;
            assetCode?: string;
            hostname?: string;
        };
        BatchRenameWorkstationsDto: {
            items: components["schemas"]["BatchRenameWorkstationItemDto"][];
        };
        UpdateWorkstationDto: {
            assetCode?: string;
            hostname?: string;
            macAddress?: string | null;
            staticIpAddress?: string | null;
            serialNumber?: string | null;
            operatingSystem?: string | null;
            isEnabled?: boolean;
            /** @enum {string} */
            type?: "master" | "client";
            /** @enum {string} */
            status?: "available" | "maintenance" | "broken" | "retired";
            notes?: string | null;
        };
        CreateLayoutDto: {
            name: string;
            canvasWidth?: number;
            canvasHeight?: number;
            isActive?: boolean;
        };
        CreateLayoutResponseDto: {
            id: string;
        };
        LayoutViewDto: {
            id: string;
            labId: string;
            name: string;
            versionNo: number;
            canvasWidth: number;
            canvasHeight: number;
            isActive: boolean;
        };
        LayoutsListResponseDto: {
            items: components["schemas"]["LayoutViewDto"][];
            total: number;
        };
        SeatViewDto: {
            id: string;
            layoutId: string;
            labId: string;
            workstationId: string | null;
            seatCode: string;
            rowNo: number | null;
            columnNo: number | null;
            positionX: number;
            positionY: number;
            rotationDegrees: number;
            /** @enum {string} */
            shape: "rect" | "circle" | "diamond";
            isDisabled: boolean;
            notes: string | null;
        };
        LayoutDetailDto: {
            id: string;
            labId: string;
            name: string;
            versionNo: number;
            canvasWidth: number;
            canvasHeight: number;
            isActive: boolean;
            seats: components["schemas"]["SeatViewDto"][];
        };
        UpdateLayoutDto: {
            name?: string;
            canvasWidth?: number;
            canvasHeight?: number;
            isActive?: boolean;
        };
        ApplyTemplateDto: {
            templateId: string;
            /** @enum {string} */
            mode?: "replace" | "append";
            matchCanvas?: boolean;
        };
        SeatUpsertItemDto: {
            id?: string;
            seatCode: string;
            workstationId?: string | null;
            rowNo?: number | null;
            columnNo?: number | null;
            positionX: number;
            positionY: number;
            rotationDegrees?: number;
            /** @enum {string} */
            shape?: "rect" | "circle" | "diamond";
            isDisabled?: boolean;
            notes?: string | null;
        };
        BulkUpsertSeatsDto: {
            seats: components["schemas"]["SeatUpsertItemDto"][];
        };
        SeatsListResponseDto: {
            items: components["schemas"]["SeatViewDto"][];
            total: number;
        };
        TemplateSeatDto: {
            x: number;
            y: number;
            label: string;
            /** @enum {string} */
            shape?: "rect" | "circle" | "diamond";
            rotation?: number;
            rowNo?: number | null;
            columnNo?: number | null;
        };
        CreateSeatingTemplateDto: {
            name: string;
            description?: string | null;
            canvasWidth?: number;
            canvasHeight?: number;
            layoutData?: components["schemas"]["TemplateSeatDto"][];
        };
        CreateSeatingTemplateResponseDto: {
            id: string;
        };
        SeatingTemplateListItemDto: {
            id: string;
            name: string;
            description: string | null;
            canvasWidth: number;
            canvasHeight: number;
            seatCount: number;
        };
        SeatingTemplatesListResponseDto: {
            items: components["schemas"]["SeatingTemplateListItemDto"][];
            total: number;
        };
        TemplateSeatViewDto: {
            x: number;
            y: number;
            label: string;
            /** @enum {string} */
            shape: "rect" | "circle" | "diamond";
            rotation: number;
            rowNo: number | null;
            columnNo: number | null;
        };
        SeatingTemplateViewDto: {
            id: string;
            name: string;
            description: string | null;
            canvasWidth: number;
            canvasHeight: number;
            seatCount: number;
            layoutData: components["schemas"]["TemplateSeatViewDto"][];
        };
        UpdateSeatingTemplateDto: {
            name?: string;
            description?: string | null;
            canvasWidth?: number;
            canvasHeight?: number;
            layoutData?: components["schemas"]["TemplateSeatDto"][];
        };
        CreateExamEventDto: {
            code: string;
            title: string;
            subjectId: string;
            /** @enum {string} */
            sessionType: "exam" | "practice";
            scheduledStartAt: string;
            scheduledEndAt: string;
            durationMinutes: number;
            policyTemplateDocumentId?: string;
            policySnapshotDocumentId?: string;
        };
        CreateExamEventResponseDto: {
            id: string;
        };
        ExamEventViewDto: {
            id: string;
            code: string;
            title: string;
            subjectId: string;
            /** @enum {string} */
            sessionType: "exam" | "practice";
            scheduledStartAt: string;
            scheduledEndAt: string;
            durationMinutes: number;
            policyTemplateDocumentId: string | null;
            policySnapshotDocumentId: string | null;
            /** @enum {string} */
            status: "draft" | "scheduled" | "active" | "completed" | "cancelled" | "aborted";
            manifestSha256: string | null;
            manifestPublishedAt: string | null;
            rowVersion: number;
            createdBy: string | null;
        };
        ExamEventsListResponseDto: {
            items: components["schemas"]["ExamEventViewDto"][];
            total: number;
        };
        ExamEventSectionViewDto: {
            id: string;
            examEventId: string;
            courseSectionId: string;
            subjectId: string;
        };
        ExamEventFileViewDto: {
            id: string;
            storedObjectId: string;
            /** @enum {string} */
            fileRole: "question" | "attachment" | "answer_template" | "guide";
            title: string | null;
            sortOrder: number;
        };
        ExamEventSessionSummaryDto: {
            id: string;
            code: string;
            labId: string;
            /** @enum {string} */
            status: "draft" | "scheduled" | "active" | "completed" | "cancelled" | "aborted";
        };
        ExamEventDetailDto: {
            id: string;
            code: string;
            title: string;
            subjectId: string;
            /** @enum {string} */
            sessionType: "exam" | "practice";
            scheduledStartAt: string;
            scheduledEndAt: string;
            durationMinutes: number;
            policyTemplateDocumentId: string | null;
            policySnapshotDocumentId: string | null;
            /** @enum {string} */
            status: "draft" | "scheduled" | "active" | "completed" | "cancelled" | "aborted";
            manifestSha256: string | null;
            manifestPublishedAt: string | null;
            rowVersion: number;
            createdBy: string | null;
            sections: components["schemas"]["ExamEventSectionViewDto"][];
            files: components["schemas"]["ExamEventFileViewDto"][];
            sessions: components["schemas"]["ExamEventSessionSummaryDto"][];
        };
        UpdateExamEventDto: {
            rowVersion: number;
            code?: string;
            title?: string;
            /** @enum {string} */
            sessionType?: "exam" | "practice";
            scheduledStartAt?: string;
            scheduledEndAt?: string;
            durationMinutes?: number;
            policyTemplateDocumentId?: string | null;
            policySnapshotDocumentId?: string | null;
        };
        AttachSectionDto: {
            courseSectionId: string;
        };
        CreateExamEventSectionResponseDto: {
            id: string;
        };
        AttachFileDto: {
            storedObjectId: string;
            /** @enum {string} */
            fileRole: "question" | "attachment" | "answer_template" | "guide";
            title?: string;
            sortOrder?: number;
        };
        CreateExamEventFileResponseDto: {
            id: string;
        };
        TransitionExamEventStatusDto: {
            /** @enum {string} */
            toStatus: "scheduled" | "active" | "completed" | "cancelled" | "aborted";
            reason: string;
            rowVersion: number;
        };
        ExamEventStatusHistoryViewDto: {
            /** @enum {string|null} */
            fromStatus: "draft" | "scheduled" | "active" | "completed" | "cancelled" | "aborted" | null;
            /** @enum {string} */
            toStatus: "draft" | "scheduled" | "active" | "completed" | "cancelled" | "aborted";
            reason: string;
            /** @enum {string} */
            actorType: "user" | "system";
            changedBy: string | null;
            commandId: string;
            createdAt: string;
        };
        ExamEventStatusHistoryListResponseDto: {
            items: components["schemas"]["ExamEventStatusHistoryViewDto"][];
            total: number;
        };
        CreateLabSessionDto: {
            code: string;
            title: string;
            labId: string;
            layoutId: string;
            scheduledStartAt?: string;
            scheduledEndAt?: string;
        };
        CreateLabSessionResponseDto: {
            id: string;
        };
        LabSessionViewDto: {
            id: string;
            examEventId: string;
            code: string;
            title: string;
            labId: string;
            layoutId: string;
            scheduledStartAt: string;
            scheduledEndAt: string;
            /** @enum {string} */
            status: "draft" | "scheduled" | "active" | "completed" | "cancelled" | "aborted";
            rowVersion: number;
            createdBy: string | null;
        };
        LabSessionsListResponseDto: {
            items: components["schemas"]["LabSessionViewDto"][];
            total: number;
        };
        SessionProctorViewDto: {
            id: string;
            lecturerId: string;
            /** @enum {string} */
            role: "lead" | "assistant";
            assignedBy: string | null;
        };
        LabSessionDetailDto: {
            id: string;
            examEventId: string;
            code: string;
            title: string;
            labId: string;
            layoutId: string;
            scheduledStartAt: string;
            scheduledEndAt: string;
            /** @enum {string} */
            status: "draft" | "scheduled" | "active" | "completed" | "cancelled" | "aborted";
            rowVersion: number;
            createdBy: string | null;
            proctors: components["schemas"]["SessionProctorViewDto"][];
            participantCount: number;
        };
        UpdateLabSessionDto: {
            rowVersion: number;
            code?: string;
            title?: string;
            labId?: string;
            layoutId?: string;
            scheduledStartAt?: string;
            scheduledEndAt?: string;
        };
        TransitionLabSessionStatusDto: {
            /** @enum {string} */
            toStatus: "scheduled" | "active" | "completed" | "cancelled" | "aborted";
            reason: string;
            rowVersion: number;
        };
        SessionStatusHistoryViewDto: {
            /** @enum {string|null} */
            fromStatus: "draft" | "scheduled" | "active" | "completed" | "cancelled" | "aborted" | null;
            /** @enum {string} */
            toStatus: "draft" | "scheduled" | "active" | "completed" | "cancelled" | "aborted";
            reason: string;
            /** @enum {string} */
            actorType: "user" | "system";
            changedBy: string | null;
            commandId: string;
            createdAt: string;
        };
        SessionStatusHistoryListResponseDto: {
            items: components["schemas"]["SessionStatusHistoryViewDto"][];
            total: number;
        };
        AssignProctorDto: {
            lecturerId: string;
            /** @enum {string} */
            role: "lead" | "assistant";
        };
        CreateProctorResponseDto: {
            id: string;
        };
        SessionParticipantViewDto: {
            id: string;
            sessionId: string;
            studentId: string;
            courseSectionId: string;
            layoutId: string;
            seatId: string | null;
            /** @enum {string} */
            status: "registered" | "checked_in" | "absent" | "submitted" | "disqualified";
            notes: string | null;
        };
        ParticipantsListResponseDto: {
            items: components["schemas"]["SessionParticipantViewDto"][];
            total: number;
        };
        AddParticipantDto: {
            studentId: string;
            courseSectionId: string;
            seatId?: string;
        };
        CreateParticipantResponseDto: {
            id: string;
        };
        BulkAddParticipantsDto: {
            studentIds: string[];
            courseSectionId: string;
        };
        BulkAddParticipantsResponseDto: {
            ids: string[];
        };
        UpdateParticipantDto: {
            seatId?: string | null;
            notes?: string | null;
        };
        CreateStoredObjectDto: {
            bucketName: string;
            objectKey: string;
            objectUri: string;
            sha256Hex: string;
            sizeBytes: number;
            contentType?: string;
        };
        CreateStoredObjectResponseDto: {
            id: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    HealthController_check: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_register: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_refresh: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AccountsController_search: {
        parameters: {
            query: {
                search?: string;
                page: number;
                pageSize: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AccountsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateAccountDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AccountsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
        };
    };
    AccountsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AccountsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateAccountDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
        };
    };
    SubjectsController_search: {
        parameters: {
            query: {
                search?: string;
                page: number;
                pageSize: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubjectsListResponseDto"];
                };
            };
        };
    };
    SubjectsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateSubjectDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateSubjectResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SubjectsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubjectViewDto"];
                };
            };
        };
    };
    SubjectsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SubjectsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateSubjectDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubjectViewDto"];
                };
            };
        };
    };
    AcademicTermsController_search: {
        parameters: {
            query: {
                search?: string;
                page: number;
                pageSize: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicTermsListResponseDto"];
                };
            };
        };
    };
    AcademicTermsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateAcademicTermDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateAcademicTermResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AcademicTermsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicTermViewDto"];
                };
            };
        };
    };
    AcademicTermsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AcademicTermsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateAcademicTermDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicTermViewDto"];
                };
            };
        };
    };
    StudentsController_search: {
        parameters: {
            query: {
                search?: string;
                page: number;
                pageSize: number;
                status?: "active" | "graduated";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StudentsListResponseDto"];
                };
            };
        };
    };
    StudentsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateStudentDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateStudentResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    StudentsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StudentViewDto"];
                };
            };
        };
    };
    StudentsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    StudentsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateStudentDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StudentViewDto"];
                };
            };
        };
    };
    LecturersController_search: {
        parameters: {
            query: {
                search?: string;
                page: number;
                pageSize: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LecturersListResponseDto"];
                };
            };
        };
    };
    LecturersController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateLecturerDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateLecturerResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LecturersController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LecturerViewDto"];
                };
            };
        };
    };
    LecturersController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LecturersController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateLecturerDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LecturerViewDto"];
                };
            };
        };
    };
    CourseSectionsController_search: {
        parameters: {
            query: {
                search?: string;
                page: number;
                pageSize: number;
                subjectId?: string;
                academicTermId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CourseSectionsListResponseDto"];
                };
            };
        };
    };
    CourseSectionsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateCourseSectionDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateCourseSectionResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CourseSectionsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CourseSectionViewDto"];
                };
            };
        };
    };
    CourseSectionsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CourseSectionsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateCourseSectionDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CourseSectionViewDto"];
                };
            };
        };
    };
    CourseSectionsController_listEnrollments: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentsListResponseDto"];
                };
            };
        };
    };
    CourseSectionsController_enroll: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EnrollStudentDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateEnrollmentResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CourseSectionsController_bulkEnroll: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BulkEnrollStudentsDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BulkEnrollResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CourseSectionsController_unenroll: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                enrollmentId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LabsController_search: {
        parameters: {
            query: {
                search?: string;
                page: number;
                pageSize: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LabsListResponseDto"];
                };
            };
        };
    };
    LabsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateLabDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateLabResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LabsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LabViewDto"];
                };
            };
        };
    };
    LabsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LabsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateLabDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LabViewDto"];
                };
            };
        };
    };
    WorkstationsController_search: {
        parameters: {
            query: {
                search?: string;
                page: number;
                pageSize: number;
            };
            header?: never;
            path: {
                labId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkstationsListResponseDto"];
                };
            };
        };
    };
    WorkstationsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                labId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateWorkstationDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateWorkstationResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    WorkstationsController_batchRename: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                labId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BatchRenameWorkstationsDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkstationsListResponseDto"];
                };
            };
        };
    };
    WorkstationsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                labId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkstationViewDto"];
                };
            };
        };
    };
    WorkstationsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                labId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    WorkstationsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                labId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateWorkstationDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkstationViewDto"];
                };
            };
        };
    };
    LayoutsController_search: {
        parameters: {
            query: {
                search?: string;
                page: number;
                pageSize: number;
            };
            header?: never;
            path: {
                labId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LayoutsListResponseDto"];
                };
            };
        };
    };
    LayoutsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                labId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateLayoutDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateLayoutResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LayoutsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                labId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LayoutDetailDto"];
                };
            };
        };
    };
    LayoutsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                labId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LayoutsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                labId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateLayoutDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LayoutViewDto"];
                };
            };
        };
    };
    LayoutsController_activate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                labId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LayoutViewDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LayoutViewDto"];
                };
            };
        };
    };
    LayoutsController_applyTemplate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                labId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ApplyTemplateDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LayoutDetailDto"];
                };
            };
        };
    };
    LayoutsController_bulkUpsertSeats: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                labId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BulkUpsertSeatsDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeatsListResponseDto"];
                };
            };
        };
    };
    LayoutsController_removeSeat: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                labId: string;
                id: string;
                seatId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SeatingTemplatesController_search: {
        parameters: {
            query: {
                search?: string;
                page: number;
                pageSize: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeatingTemplatesListResponseDto"];
                };
            };
        };
    };
    SeatingTemplatesController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateSeatingTemplateDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateSeatingTemplateResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SeatingTemplatesController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeatingTemplateViewDto"];
                };
            };
        };
    };
    SeatingTemplatesController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SeatingTemplatesController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateSeatingTemplateDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeatingTemplateViewDto"];
                };
            };
        };
    };
    ExamEventsController_search: {
        parameters: {
            query: {
                search?: string;
                page: number;
                pageSize: number;
                subjectId?: string;
                status?: "draft" | "scheduled" | "active" | "completed" | "cancelled" | "aborted";
                from?: string;
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExamEventsListResponseDto"];
                };
            };
        };
    };
    ExamEventsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateExamEventDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateExamEventResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExamEventsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExamEventDetailDto"];
                };
            };
        };
    };
    ExamEventsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExamEventsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateExamEventDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExamEventDetailDto"];
                };
            };
        };
    };
    ExamEventsController_attachSection: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AttachSectionDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateExamEventSectionResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExamEventsController_removeSection: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                sectionLinkId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExamEventsController_attachFile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AttachFileDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateExamEventFileResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExamEventsController_removeFile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                fileId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExamEventsController_transitionStatus: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TransitionExamEventStatusDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExamEventDetailDto"];
                };
            };
        };
    };
    ExamEventsController_listStatusHistory: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExamEventStatusHistoryListResponseDto"];
                };
            };
        };
    };
    LabSessionsController_search: {
        parameters: {
            query: {
                search?: string;
                page: number;
                pageSize: number;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LabSessionsListResponseDto"];
                };
            };
        };
    };
    LabSessionsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateLabSessionDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateLabSessionResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LabSessionsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LabSessionDetailDto"];
                };
            };
        };
    };
    LabSessionsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LabSessionsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateLabSessionDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LabSessionViewDto"];
                };
            };
        };
    };
    LabSessionsController_transitionStatus: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TransitionLabSessionStatusDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LabSessionDetailDto"];
                };
            };
        };
    };
    LabSessionsController_listStatusHistory: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionStatusHistoryListResponseDto"];
                };
            };
        };
    };
    LabSessionsController_addProctor: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssignProctorDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateProctorResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LabSessionsController_removeProctor: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                sessionId: string;
                proctorId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LabSessionsController_listParticipants: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ParticipantsListResponseDto"];
                };
            };
        };
    };
    LabSessionsController_addParticipant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddParticipantDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateParticipantResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LabSessionsController_bulkAddParticipants: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BulkAddParticipantsDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BulkAddParticipantsResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LabSessionsController_removeParticipant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                sessionId: string;
                participantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LabSessionsController_updateParticipant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                sessionId: string;
                participantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateParticipantDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionParticipantViewDto"];
                };
            };
        };
    };
    StoredObjectsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateStoredObjectDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateStoredObjectResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LabRoomProposalsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateLabRoomProposalDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateLabRoomProposalResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LabRoomProposalsController_search: {
        parameters: {
            query?: {
                search?: string;
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LabRoomProposalsListResponseDto"];
                };
            };
        };
    };
    LabRoomProposalsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LabRoomProposalViewDto"];
                };
            };
        };
    };
}
