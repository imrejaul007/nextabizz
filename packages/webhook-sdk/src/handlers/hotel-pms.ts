import { WebhookHandler } from '../verify';

export interface HotelPMSReservationData {
  reservationId: string;
  guestCount: number;
  checkInDate: string;
  checkOutDate: string;
  services: string[];
}

export const hotelPMSHandlers: WebhookHandler[] = [
  {
    source: 'hotel-pms',
    type: 'reservation.created',
    handler: async (payload) => {
      console.log('Hotel PMS reservation created:', payload.data);
      // Handle reservation logic for inventory forecasting
    },
  },
  {
    source: 'hotel-pms',
    type: 'reservation.updated',
    handler: async (payload) => {
      console.log('Hotel PMS reservation updated:', payload.data);
      // Handle reservation update logic
    },
  },
];
