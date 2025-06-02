import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-netinfo/netinfo';

const API_BASE_URL = 'https://your-api-url.com/api';
const OFFLINE_LOCATIONS_KEY = 'offline_locations';
const USER_PATH_KEY = 'user_path_history';
const LOCATION_SETTINGS_KEY = 'location_settings';

export class OfflineLocationService {
  static async saveLocationOffline(latitude, longitude, isBackground = false) {
    try {
      const locationData = {
        latitude,
        longitude,
        timestamp: new Date().toISOString(),
        isBackground,
        id: Date.now() + Math.random(), // Unique ID
        synced: false
      };

      // Išsaugoti offline queue
      const existingLocations = await this.getOfflineLocations();
      existingLocations.push(locationData);
      await AsyncStorage.setItem(OFFLINE_LOCATIONS_KEY, JSON.stringify(existingLocations));

      // Išsaugoti vartotojo kelią
      await this.saveUserPath(latitude, longitude);

      console.log('📍 Location saved offline:', locationData);
      return { success: true, savedOffline: true };
    } catch (error) {
      console.error('Error saving location offline:', error);
      return { success: false, error: error.message };
    }
  }

  static async saveUserPath(latitude, longitude) {
    try {
      const pathData = {
        latitude,
        longitude,
        timestamp: new Date().toISOString()
      };

      const existingPath = await this.getUserPath();
      existingPath.push(pathData);

      // Saugoti tik paskutinius 1000 taškų (apie 5-6 valandas)
      if (existingPath.length > 1000) {
        existingPath.splice(0, existingPath.length - 1000);
      }

      await AsyncStorage.setItem(USER_PATH_KEY, JSON.stringify(existingPath));
    } catch (error) {
      console.error('Error saving user path:', error);
    }
  }

  static async getUserPath() {
    try {
      const pathData = await AsyncStorage.getItem(USER_PATH_KEY);
      return pathData ? JSON.parse(pathData) : [];
    } catch (error) {
      console.error('Error getting user path:', error);
      return [];
    }
  }

  static async clearUserPath() {
    try {
      await AsyncStorage.removeItem(USER_PATH_KEY);
      return { success: true };
    } catch (error) {
      console.error('Error clearing user path:', error);
      return { success: false };
    }
  }

  static async getOfflineLocations() {
    try {
      const locations = await AsyncStorage.getItem(OFFLINE_LOCATIONS_KEY);
      return locations ? JSON.parse(locations) : [];
    } catch (error) {
      console.error('Error getting offline locations:', error);
      return [];
    }
  }

  static async syncOfflineLocations() {
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        console.log('📶 No internet connection, skipping sync');
        return { success: false, reason: 'no_internet' };
      }

      const offlineLocations = await this.getOfflineLocations();
      const unsyncedLocations = offlineLocations.filter(loc => !loc.synced);

      if (unsyncedLocations.length === 0) {
        return { success: true, syncedCount: 0 };
      }

      console.log(`🔄 Syncing ${unsyncedLocations.length} offline locations...`);

      let syncedCount = 0;
      const failedLocations = [];

      // Siųsti po vieną, kad neperkrautume serverio
      for (const location of unsyncedLocations) {
        try {
          const token = await AsyncStorage.getItem('userToken');
          const userId = await AsyncStorage.getItem('userId');

          if (!token || !userId) {
            throw new Error('No auth token');
          }

          const response = await fetch(`${API_BASE_URL}/location/update`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: parseInt(userId),
              latitude: location.latitude,
              longitude: location.longitude,
              timestamp: location.timestamp,
              background: location.isBackground,
              offline_sync: true
            }),
            timeout: 10000 // 10s timeout
          });

          if (response.ok) {
            location.synced = true;
            syncedCount++;
          } else {
            failedLocations.push(location);
          }

          // Maža pauzė tarp užklausų
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          console.error('Failed to sync location:', error);
          failedLocations.push(location);
        }
      }

      // Atnaujinti offline duomenis
      const updatedLocations = offlineLocations.map(loc => {
        const updated = unsyncedLocations.find(ul => ul.id === loc.id);
        return updated || loc;
      });

      await AsyncStorage.setItem(OFFLINE_LOCATIONS_KEY, JSON.stringify(updatedLocations));

      // Išvalyti senus sinchronizuotus duomenis (>24h)
      await this.cleanupOldLocations();

      console.log(`✅ Synced ${syncedCount}/${unsyncedLocations.length} locations`);

      return {
        success: true,
        syncedCount,
        failedCount: failedLocations.length,
        totalOffline: offlineLocations.length
      };

    } catch (error) {
      console.error('Error syncing offline locations:', error);
      return { success: false, error: error.message };
    }
  }

  static async cleanupOldLocations() {
    try {
      const locations = await this.getOfflineLocations();
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const recentLocations = locations.filter(loc => {
        const locDate = new Date(loc.timestamp);
        return locDate > oneDayAgo || !loc.synced;
      });

      if (recentLocations.length !== locations.length) {
        await AsyncStorage.setItem(OFFLINE_LOCATIONS_KEY, JSON.stringify(recentLocations));
        console.log(`🧹 Cleaned up ${locations.length - recentLocations.length} old locations`);
      }
    } catch (error) {
      console.error('Error cleaning up locations:', error);
    }
  }

  static async getLocationSettings() {
    try {
      const settings = await AsyncStorage.getItem(LOCATION_SETTINGS_KEY);
      return settings ? JSON.parse(settings) : {
        trackingEnabled: true,
        syncOnWifi: false,
        pathRecording: true,
        offlineMode: true
      };
    } catch (error) {
      return {
        trackingEnabled: true,
        syncOnWifi: false,
        pathRecording: true,
        offlineMode: true
      };
    }
  }

  static async updateLocationSettings(newSettings) {
    try {
      const currentSettings = await this.getLocationSettings();
      const updatedSettings = { ...currentSettings, ...newSettings };
      await AsyncStorage.setItem(LOCATION_SETTINGS_KEY, JSON.stringify(updatedSettings));
      return { success: true };
    } catch (error) {
      console.error('Error updating settings:', error);
      return { success: false };
    }
  }

  static async getOfflineStats() {
    try {
      const offlineLocations = await this.getOfflineLocations();
      const userPath = await this.getUserPath();
      const settings = await this.getLocationSettings();

      const unsyncedCount = offlineLocations.filter(loc => !loc.synced).length;
      const syncedCount = offlineLocations.filter(loc => loc.synced).length;

      return {
        totalOfflineLocations: offlineLocations.length,
        unsyncedLocations: unsyncedCount,
        syncedLocations: syncedCount,
        pathPoints: userPath.length,
        settings
      };
    } catch (error) {
      console.error('Error getting offline stats:', error);
      return {
        totalOfflineLocations: 0,
        unsyncedLocations: 0,
        syncedLocations: 0,
        pathPoints: 0,
        settings: {}
      };
    }
  }
}