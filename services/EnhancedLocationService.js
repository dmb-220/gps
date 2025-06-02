import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-netinfo/netinfo';
import { OfflineLocationService } from './OfflineLocationService';
import { GroupService } from './GroupService';

const API_BASE_URL = 'https://your-api-url.com/api';

export class EnhancedLocationService {
  static async updateLocation(latitude, longitude, isBackground = false) {
    try {
      // Patikrinti ar yra aktyvi grupės sesija
      const currentSession = await GroupService.getCurrentSession();
      
      if (!currentSession || currentSession.status !== 'active') {
        console.log('📍 No active group session - location not tracked');
        return { 
          success: false, 
          message: 'Nėra aktyvios grupės sesijos' 
        };
      }

      // Išsaugoti offline su grupės ID
      await OfflineLocationService.saveLocationOffline(
        latitude, 
        longitude, 
        isBackground,
        currentSession.groupId
      );

      // Bandyti siųsti į API
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        console.log('📶 No internet - location saved offline only');
        return { 
          success: true, 
          savedOffline: true, 
          message: 'Išsaugota offline (nėra interneto)' 
        };
      }

      const token = await AsyncStorage.getItem('userToken');
      const userId = await AsyncStorage.getItem('userId');
      
      if (!token || !userId) {
        throw new Error('No authentication token');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${API_BASE_URL}/location/update`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: parseInt(userId),
          latitude,
          longitude,
          timestamp: new Date().toISOString(),
          background: isBackground,
          groupId: currentSession.groupId,
          sessionId: currentSession.sessionId
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();
      
      if (response.ok) {
        setTimeout(() => {
          OfflineLocationService.syncOfflineLocations();
        }, 1000);

        return {
          success: true,
          data,
          message: 'Lokacija atnaujinta'
        };
      } else {
        return {
          success: true,
          savedOffline: true,
          message: 'Išsaugota offline (serverio klaida)'
        };
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request timeout - saved offline');
      } else {
        console.error('Update location error:', error);
      }
      
      return {
        success: true,
        savedOffline: true,
        message: 'Išsaugota offline'
      };
    }
  }

  static async updateLocationBackground(latitude, longitude) {
    return await this.updateLocation(latitude, longitude, true);
  }

  static async getNearbyUsers() {
    try {
      const currentSession = await GroupService.getCurrentSession();
      
      if (!currentSession) {
        return {
          success: false,
          users: [],
          message: 'Nėra aktyvios sesijos'
        };
      }

      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        return {
          success: false,
          users: [],
          message: 'Nėra interneto ryšio'
        };
      }

      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch(`${API_BASE_URL}/groups/${currentSession.groupId}/nearby-members`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000
      });

      const data = await response.json();
      
      if (response.ok) {
        return {
          success: true,
          users: data.members || [],
        };
      } else {
        return {
          success: false,
          message: data.message || 'Failed to fetch group members',
          users: [],
        };
      }
    } catch (error) {
      console.error('Get nearby group members error:', error);
      return {
        success: false,
        message: error.name === 'AbortError' ? 'Timeout' : 'Network error',
        users: [],
      };
    }
  }

  static async forceSync() {
    return await OfflineLocationService.syncOfflineLocations();
  }
}