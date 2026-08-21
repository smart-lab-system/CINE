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
        get?: never;
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
        get?: never;
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
        get?: never;
        put?: never;
        post?: never;
        delete: operations["AcademicTermsController_remove"];
        options?: never;
        head?: never;
        patch: operations["AcademicTermsController_update"];
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
        get?: never;
        put?: never;
        post?: never;
        delete: operations["LecturersController_remove"];
        options?: never;
        head?: never;
        patch: operations["LecturersController_update"];
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
        get?: never;
        put?: never;
        post?: never;
        delete: operations["StudentsController_remove"];
        options?: never;
        head?: never;
        patch: operations["StudentsController_update"];
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
        get?: never;
        put?: never;
        post?: never;
        delete: operations["CourseSectionsController_remove"];
        options?: never;
        head?: never;
        patch: operations["CourseSectionsController_update"];
        trace?: never;
    };
    "/course-sections/{sectionId}/enrollments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["CourseSectionEnrollmentsController_list"];
        put?: never;
        post: operations["CourseSectionEnrollmentsController_enroll"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/course-sections/{sectionId}/enrollments/{studentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["CourseSectionEnrollmentsController_unenroll"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/students/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["StudentsImportController_import"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/students/import/{jobId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["StudentsImportController_status"];
        put?: never;
        post?: never;
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
        SubjectListItemDto: {
            id: string;
            code: string;
            name: string;
            credits: number | null;
            description: string | null;
        };
        PaginatedSubjectsDto: {
            items: components["schemas"]["SubjectListItemDto"][];
            total: number;
        };
        UpdateSubjectDto: {
            name?: string;
            credits?: number;
            description?: string;
        };
        CreateAcademicTermDto: {
            code: string;
            name: string;
            startsOn: string;
            endsOn: string;
        };
        AcademicTermListItemDto: {
            id: string;
            code: string;
            name: string;
            startsOn: string;
            endsOn: string;
            isActive: boolean;
        };
        PaginatedAcademicTermsDto: {
            items: components["schemas"]["AcademicTermListItemDto"][];
            total: number;
        };
        UpdateAcademicTermDto: {
            name?: string;
            startsOn?: string;
            endsOn?: string;
            isActive?: boolean;
        };
        CreateLecturerDto: {
            employeeCode: string;
            fullName: string;
            department?: string;
            academicTitle?: string;
        };
        LecturerListItemDto: {
            id: string;
            employeeCode: string;
            fullName: string;
            department: string | null;
            academicTitle: string | null;
        };
        PaginatedLecturersDto: {
            items: components["schemas"]["LecturerListItemDto"][];
            total: number;
        };
        UpdateLecturerDto: {
            fullName?: string;
            department?: string;
            academicTitle?: string;
        };
        CreateStudentDto: {
            studentCode: string;
            fullName: string;
            dateOfBirth?: string;
            classCode?: string;
            cohortYear?: number;
        };
        StudentListItemDto: {
            id: string;
            studentCode: string;
            fullName: string;
            dateOfBirth: string | null;
            classCode: string | null;
            cohortYear: number | null;
        };
        PaginatedStudentsDto: {
            items: components["schemas"]["StudentListItemDto"][];
            total: number;
        };
        UpdateStudentDto: {
            fullName?: string;
            dateOfBirth?: string;
            classCode?: string;
            cohortYear?: number;
        };
        CreateCourseSectionDto: {
            subjectId: string;
            academicTermId: string;
            sectionCode: string;
            nominalClassCode?: string;
            name?: string;
        };
        CourseSectionSubjectRefDto: {
            id: string;
            code: string;
            name: string;
        };
        CourseSectionTermRefDto: {
            id: string;
            code: string;
            name: string;
        };
        CourseSectionListItemDto: {
            id: string;
            sectionCode: string;
            nominalClassCode: string | null;
            name: string | null;
            subject: components["schemas"]["CourseSectionSubjectRefDto"];
            academicTerm: components["schemas"]["CourseSectionTermRefDto"];
        };
        PaginatedCourseSectionsDto: {
            items: components["schemas"]["CourseSectionListItemDto"][];
            total: number;
        };
        UpdateCourseSectionDto: {
            nominalClassCode?: string;
            name?: string;
        };
        CreateEnrollmentDto: {
            studentId: string;
        };
        EnrollmentStudentRefDto: {
            id: string;
            studentCode: string;
            fullName: string;
        };
        EnrollmentListItemDto: {
            id: string;
            /** Format: date-time */
            enrolledAt: string;
            student: components["schemas"]["EnrollmentStudentRefDto"];
        };
        PaginatedEnrollmentsDto: {
            items: components["schemas"]["EnrollmentListItemDto"][];
            total: number;
        };
        ImportRowErrorDto: {
            row: number;
            studentCode: string | null;
            message: string;
        };
        ImportResultDto: {
            totalRows: number;
            created: number;
            updated: number;
            failed: number;
            errors: components["schemas"]["ImportRowErrorDto"][];
        };
        ImportJobStatusDto: {
            jobId: string;
            state: string;
            result: components["schemas"]["ImportResultDto"] | null;
            failedReason: string | null;
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
                    "application/json": components["schemas"]["PaginatedSubjectsDto"];
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
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
                    "application/json": components["schemas"]["SubjectListItemDto"];
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
                    "application/json": components["schemas"]["PaginatedAcademicTermsDto"];
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
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
                    "application/json": components["schemas"]["AcademicTermListItemDto"];
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
                    "application/json": components["schemas"]["PaginatedLecturersDto"];
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
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
                    "application/json": components["schemas"]["LecturerListItemDto"];
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
                    "application/json": components["schemas"]["PaginatedStudentsDto"];
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
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
                    "application/json": components["schemas"]["StudentListItemDto"];
                };
            };
        };
    };
    CourseSectionsController_search: {
        parameters: {
            query: {
                search?: string;
                subjectId?: string;
                academicTermId?: string;
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
                    "application/json": components["schemas"]["PaginatedCourseSectionsDto"];
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
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
                    "application/json": components["schemas"]["CourseSectionListItemDto"];
                };
            };
        };
    };
    CourseSectionEnrollmentsController_list: {
        parameters: {
            query: {
                page: number;
                pageSize: number;
            };
            header?: never;
            path: {
                sectionId: string;
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
                    "application/json": components["schemas"]["PaginatedEnrollmentsDto"];
                };
            };
        };
    };
    CourseSectionEnrollmentsController_enroll: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sectionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateEnrollmentDto"];
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
    CourseSectionEnrollmentsController_unenroll: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sectionId: string;
                studentId: string;
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
    StudentsImportController_import: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    StudentsImportController_status: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                jobId: string;
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
                    "application/json": components["schemas"]["ImportJobStatusDto"];
                };
            };
        };
    };
}
