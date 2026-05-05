export enum UserStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
}

export interface Customer {
  id?: string;
  customerNumber: string;
  password?: string;
  name: string;
  phone?: string;
  status: UserStatus;
  expirationDate: string; // ISO string
  assignedPacks: string[];
  lastLogin?: string;
}

export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  category: string;
}

export interface Pack {
  id: string;
  name: string;
  channels: string[]; // List of channel IDs
}

export interface Ad {
  id: string;
  imageUrl: string;
  title: string;
  text: string;
  whatsappNumber: string;
  startDate?: string;
  endDate?: string;
  active: boolean;
}

export interface Metric {
  id?: string;
  channelId: string;
  userId: string;
  timestamp: string;
}
