export interface IBookAppointmentPayload {
	scheduleId: string;
	type: "ONLINE" | "IN_PERSON";
}
export interface IPayAppointmentPayload {
	appointmentId: string;
}
export interface ICancelAppointmentPayload {
	appointmentId: string;
}

export interface IUpdateAppointmentStatusPayload {
	status: "ONGOING" | "COMPLETED";
	// status: AppointmentStatus
}
