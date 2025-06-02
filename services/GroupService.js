import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-netinfo/netinfo';

const API_BASE_URL = 'https://your-api-url.com/api';
const CURRENT_GROUP_KEY = 'current_group';
const GROUP_HISTORY_KEY = 'group_history';

export class GroupService {
  // Sukurti naują grupę (tik admin)
  static async createGroup(groupData) {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const userId = await AsyncStorage.getItem('userId');
      
      if (!token || !userId) {
        throw new Error('No auth token');
      }

      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        return { success: false, message: 'Nėra interneto ryšio' };
      }

      const response = await fetch(`${API_BASE_URL}/groups/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...groupData,
          createdBy: parseInt(userId),
          createdAt: new Date().toISOString()
        }),
        timeout: 10000
      });

      const data = await response.json();
      
      if (response.ok) {
        return {
          success: true,
          group: data.group,
          message: 'Grupė sukurta sėkmingai'
        };
      } else {
        return {
          success: false,
          message: data.message || 'Nepavyko sukurti grupės'
        };
      }
    } catch (error) {
      console.error('Create group error:', error);
      return {
        success: false,
        message: 'Klaida kuriant grupę'
      };
    }
  }

  // Gauti vartotojo grupes
  static async getUserGroups() {
    try {
      const token = await AsyncStorage.getItem('userToken');
      
      if (!token) {
        throw new Error('No auth token');
      }

      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        return { success: false, groups: [], message: 'Nėra interneto' };
      }

      const response = await fetch(`${API_BASE_URL}/groups/my-groups`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000
      });

      const data = await response.json();
      
      if (response.ok) {
        return {
          success: true,
          groups: data.groups || []
        };
      } else {
        return {
          success: false,
          groups: [],
          message: data.message || 'Nepavyko gauti grupių'
        };
      }
    } catch (error) {
      console.error('Get groups error:', error);
      return {
        success: false,
        groups: [],
        message: 'Klaida gaunant grupes'
      };
    }
  }

  // Prisijungti prie grupės
  static async joinGroup(groupId) {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const userId = await AsyncStorage.getItem('userId');
      
      if (!token || !userId) {
        throw new Error('No auth token');
      }

      const response = await fetch(`${API_BASE_URL}/groups/${groupId}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: parseInt(userId),
          joinedAt: new Date().toISOString()
        }),
        timeout: 10000
      });

      const data = await response.json();
      
      if (response.ok) {
        return {
          success: true,
          message: 'Prisijungėte prie grupės'
        };
      } else {
        return {
          success: false,
          message: data.message || 'Nepavyko prisijungti'
        };
      }
    } catch (error) {
      console.error('Join group error:', error);
      return {
        success: false,
        message: 'Klaida prisijungiant prie grupės'
      };
    }
  }

  // Pradėti grupės sesiją
  static async startGroupSession(groupId) {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const userId = await AsyncStorage.getItem('userId');
      
      const sessionData = {
        groupId,
        userId: parseInt(userId),
        startedAt: new Date().toISOString(),
        status: 'active'
      };

      // Išsaugoti aktyvią sesiją locally
      await AsyncStorage.setItem(CURRENT_GROUP_KEY, JSON.stringify(sessionData));

      const response = await fetch(`${API_BASE_URL}/groups/${groupId}/start-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData),
        timeout: 10000
      });

      const data = await response.json();
      
      if (response.ok) {
        return {
          success: true,
          session: data.session,
          message: 'Grupės sesija pradėta'
        };
      } else {
        return {
          success: true, // Sėkmė locally, net jei API nepavyko
          savedOffline: true,
          message: 'Sesija pradėta (offline)'
        };
      }
    } catch (error) {
      console.error('Start session error:', error);
      return {
        success: true,
        savedOffline: true,
        message: 'Sesija pradėta (offline)'
      };
    }
  }

  // Baigti grupės sesiją
  static async endGroupSession() {
    try {
      const currentGroupData = await AsyncStorage.getItem(CURRENT_GROUP_KEY);
      if (!currentGroupData) {
        return { success: false, message: 'Nėra aktyvios sesijos' };
      }

      const sessionData = JSON.parse(currentGroupData);
      sessionData.endedAt = new Date().toISOString();
      sessionData.status = 'completed';

      // Išsaugoti į istoriją
      await this.saveSessionToHistory(sessionData);

      // Išvalyti aktyvią sesiją
      await AsyncStorage.removeItem(CURRENT_GROUP_KEY);

      const token = await AsyncStorage.getItem('userToken');
      
      if (token) {
        try {
          const response = await fetch(`${API_BASE_URL}/groups/${sessionData.groupId}/end-session`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(sessionData),
            timeout: 10000
          });

          if (response.ok) {
            console.log('Session ended successfully on server');
          }
        } catch (error) {
          console.log('Failed to end session on server, but saved locally');
        }
      }

      return {
        success: true,
        message: 'Sesija baigta sėkmingai'
      };
    } catch (error) {
      console.error('End session error:', error);
      return {
        success: false,
        message: 'Klaida baigiant sesiją'
      };
    }
  }

  // Išsaugoti sesiją į istoriją
  static async saveSessionToHistory(sessionData) {
    try {
      const historyData = await AsyncStorage.getItem(GROUP_HISTORY_KEY);
      const history = historyData ? JSON.parse(historyData) : [];
      
      history.unshift(sessionData); // Pridėti į pradžią
      
      // Saugoti tik paskutines 50 sesijų
      if (history.length > 50) {
        history.splice(50);
      }

      await AsyncStorage.setItem(GROUP_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Error saving session to history:', error);
    }
  }

  // Gauti sesijų istoriją
  static async getSessionHistory() {
    try {
      const historyData = await AsyncStorage.getItem(GROUP_HISTORY_KEY);
      return historyData ? JSON.parse(historyData) : [];
    } catch (error) {
      console.error('Error getting session history:', error);
      return [];
    }
  }

  // Gauti aktyvią sesiją
  static async getCurrentSession() {
    try {
      const currentGroupData = await AsyncStorage.getItem(CURRENT_GROUP_KEY);
      return currentGroupData ? JSON.parse(currentGroupData) : null;
    } catch (error) {
      console.error('Error getting current session:', error);
      return null;
    }
  }

  // Gauti grupės narius
  static async getGroupMembers(groupId) {
    try {
      const token = await AsyncStorage.getItem('userToken');
      
      if (!token) {
        throw new Error('No auth token');
      }

      const response = await fetch(`${API_BASE_URL}/groups/${groupId}/members`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000
      });

      const data = await response.json();
      
      if (response.ok) {
        return {
          success: true,
          members: data.members || []
        };
      } else {
        return {
          success: false,
          members: [],
          message: data.message || 'Nepavyko gauti narių'
        };
      }
    } catch (error) {
      console.error('Get members error:', error);
      return {
        success: false,
        members: [],
        message: 'Klaida gaunant narius'
      };
    }
  }

  // Pridėti narį į grupę (admin)
  static async addMemberToGroup(groupId, userEmail) {
    try {
      const token = await AsyncStorage.getItem('userToken');
      
      if (!token) {
        throw new Error('No auth token');
      }

      const response = await fetch(`${API_BASE_URL}/groups/${groupId}/add-member`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userEmail,
          addedAt: new Date().toISOString()
        }),
        timeout: 10000
      });

      const data = await response.json();
      
      if (response.ok) {
        return {
          success: true,
          message: 'Narys pridėtas sėkmingai'
        };
      } else {
        return {
          success: false,
          message: data.message || 'Nepavyko pridėti nario'
        };
      }
    } catch (error) {
      console.error('Add member error:', error);
      return {
        success: false,
        message: 'Klaida pridedant narį'
      };
    }
  }
}