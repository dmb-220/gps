import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://your-api-url.com/api'; // Pakeiskite savo API URL

export class AuthService {
  static async login(email, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      
      if (response.ok) {
        return {
          success: true,
          token: data.token,
          userId: data.userId,
        };
      } else {
        return {
          success: false,
          message: data.message || 'Prisijungimo klaida',
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: 'Tinklo klaida',
      };
    }
  }

  static async register(name, email, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();
      
      if (response.ok) {
        return {
          success: true,
          message: 'Registracija sėkminga',
        };
      } else {
        return {
          success: false,
          message: data.message || 'Registracijos klaida',
        };
      }
    } catch (error) {
      console.error('Register error:', error);
      return {
        success: false,
        message: 'Tinklo klaida',
      };
    }
  }

  static async logout() {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (token) {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
}