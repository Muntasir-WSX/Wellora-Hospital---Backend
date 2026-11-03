import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { DepartmentController } from "./department.controller";
import {
	CreateDepartmentSchema,
	UpdateDepartmentSchema,
} from "./department.validation";

const router = Router();

router.get("/", DepartmentController.getDepartments);
router.post(
	"/",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	validateRequest(CreateDepartmentSchema),
	DepartmentController.createDepartment,
);
router.patch(
	"/:departmentId",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	validateRequest(UpdateDepartmentSchema),
	DepartmentController.updateDepartment,
);
router.delete(
	"/:departmentId",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	DepartmentController.deleteDepartment,
);

export const DepartmentRoutes = router;
