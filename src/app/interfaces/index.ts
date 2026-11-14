export interface IQuery {
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: string;
  searchTerm?: string;
  departmentId?: string;
  specialization?: string;
  email?: string;
  licenseNumber?: string;
  verificationStatus?: string;
  qualifications?: string;
  [key: string]: string | undefined;
}