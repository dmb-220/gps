import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Text,
  Dimensions,
  AppState,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-netinfo/netinfo';
import { EnhancedLocationService } from '../services/EnhancedLocationService';
import { OfflineLocationService } from '../services/OfflineLocationService';
import { AuthService } from '../services/AuthService';

const { width, height } = Dimensions.get('window');

// Background location task
const BACKGROUND_LOCATION_TASK = 'background-location-task';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    const location = locations[0];
    
    try {
      await EnhancedLocationService.updateLocationBackground(
        location.coords.latitude,
        location.coords.longitude
      );
      console.log('📍 Background location saved:', location.coords);
    } catch (err) {
      console.error('Failed to save background location:', err);
    }
  }
});

export default function EnhancedMapScreen({ navigation }) {
  const [location, setLocation] = useState(null);
  const [users, setUsers] = useState([]);
  const [userPath, setUserPath] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backgroundTracking, setBackgroundTracking] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineStats, setOfflineStats] = useState({});
  const [showPath, setShowPath] = useState(true);
  const [appState, setAppState] = useState(AppState.currentState);
  
  const mapRef = useRef(null);
  const locationIntervalRef = useRef(null);
  const usersIntervalRef = useRef(null);
  const syncIntervalRef = useRef(null);

  useEffect(() => {
    getCurrentLocation();
    fetchUsers();
    loadUserPath();
    loadOfflineStats();
    setupBackgroundLocation();
    setupNetworkListener();
    
    // App state listener
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Location updates - miškuose dažniau (kas 10s)
    locationIntervalRef.current = setInterval(() => {
      if (appState === 'active') {
        getCurrentLocation();
      }
    }, 10000);

    // Users updates - rečiau (kas 30s)
    usersIntervalRef.current = setInterval(() => {
      if (appState === 'active' && isOnline) {
        fetchUsers();
      }
    }, 30000);

    // Sync attempts - kas 2 minutes
    syncIntervalRef.current = setInterval(() => {
      if (isOnline) {
        OfflineLocationService.syncOfflineLocations();
        loadOfflineStats();
      }
    }, 120000);

    return () => {
      clearInterval(locationIntervalRef.current);
      clearInterval(usersIntervalRef.current);
      clearInterval(syncIntervalRef.current);
      subscription?.remove();
    };
  }, []);

  const setupNetworkListener = () => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected);
      
      if (state.isConnected) {
        console.log('📶 Internet connection restored - starting sync...');
        // Pradėti sinchronizaciją kai atsiranda internetas
        setTimeout(() => {
          OfflineLocationService.syncOfflineLocations();
          fetchUsers();
          loadOfflineStats();
        }, 1000);
      } else {
        console.log('📶 Internet connection lost - switching to offline mode');
      }
    });

    return unsubscribe;
  };

  const handleAppStateChange = (nextAppState) => {
    if (appState.match(/inactive|background/) && nextAppState === 'active') {
      console.log('App foreground - refreshing data...');
      getCurrentLocation();
      loadUserPath();
      loadOfflineStats();
      if (isOnline) {
        fetchUsers();
        OfflineLocationService.syncOfflineLocations();
      }
    }
    setAppState(nextAppState);
  };

  const loadUserPath = async () => {
    try {
      const path = await OfflineLocationService.getUserPath();
      setUserPath(path);
    } catch (error) {
      console.error('Error loading user path:', error);
    }
  };

  const loadOfflineStats = async () => {
    try {
      const stats = await OfflineLocationService.getOfflineStats();
      setOfflineStats(stats);
    } catch (error) {
      console.error('Error loading offline stats:', error);
    }
  };

  const setupBackgroundLocation = async () => {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        Alert.alert('Klaida', 'Reikalingas leidimas naudoti GPS');
        return;
      }

      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        Alert.alert(
          'Background lokacija',
          'Miškuose rekomenduojama įjungti "Always" GPS leidimą',
          [
            { text: 'Vėliau', style: 'cancel' },
            { text: 'Nustatymai', onPress: () => Location.enableNetworkProviderAsync() }
          ]
        );
        return;
      }

      // Miškuose - dažnesnis tracking
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High, // Aukštas tikslumas
        timeInterval: 30000, // 30s background
        distanceInterval: 5, // 5m distance
        deferredUpdatesInterval: 30000,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Miško GPS Sekimas',
          notificationBody: 'Aktyvus: kas 10s | Fone: kas 30s',
          notificationColor: '#34C759',
        },
      });

      setBackgroundTracking(true);
      console.log('🌲 Forest GPS tracking started (high accuracy)');
      
      Alert.alert(
        'Miško GPS sekimas įjungtas',
        '🌲 Optimizuota miškams:\n• Aukštas tikslumas\n• Kas 10s aktyviai\n• Kas 30s fone\n• Offline saugojimas'
      );
    } catch (error) {
      console.error('Error setting up background location:', error);
    }
  };

  const stopBackgroundLocation = async () => {
    try {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      setBackgroundTracking(false);
      console.log('Background location tracking stopped');
    } catch (error) {
      console.error('Error stopping background location:', error);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Klaida', 'Reikalingas leidimas naudoti GPS');
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 10000,
      });

      const newLocation = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.01, // Smaller delta for forest details
        longitudeDelta: 0.01,
      };

      setLocation(newLocation);
      
      // Send location using enhanced service
      const result = await EnhancedLocationService.updateLocation(
        currentLocation.coords.latitude,
        currentLocation.coords.longitude
      );
      
      // Refresh path after location update
      if (result.success) {
        loadUserPath();
        loadOfflineStats();
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('GPS Klaida', 'Nepavyko gauti lokacijos. Patikrinkite GPS nustatymus.');
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await EnhancedLocationService.getNearbyUsers();
      if (response.success) {
        setUsers(response.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleSync = async () => {
    if (!isOnline) {
      Alert.alert('Nėra interneto', 'Sinchronizacija nepavyks be interneto ryšio');
      return;
    }

    Alert.alert(
      'Sinchronizacija',
      `Nesinchronizuotų taškų: ${offlineStats.unsyncedLocations || 0}\nBandyti sinchronizuoti?`,
      [
        { text: 'Atšaukti', style: 'cancel' },
        { 
          text: 'Sinchronizuoti', 
          onPress: async () => {
            const result = await OfflineLocationService.syncOfflineLocations();
            if (result.success) {
              Alert.alert(
                'Sinchronizacija',
                `✅ Sinchronizuota: ${result.syncedCount}\n❌ Nepavyko: ${result.failedCount || 0}`
              );
              loadOfflineStats();
            } else {
              Alert.alert('Klaida', 'Sinchronizacija nepavyko');
            }
          }
        }
      ]
    );
  };

  const handleClearPath = () => {
    Alert.alert(
      'Išvalyti kelią',
      'Ar tikrai norite išvalyti savo kelio istoriją?',
      [
        { text: 'Atšaukti', style: 'cancel' },
        { 
          text: 'Išvalyti', 
          style: 'destructive',
          onPress: async () => {
            await OfflineLocationService.clearUserPath();
            setUserPath([]);
            Alert.alert('Sėkmė', 'Kelio istorija išvalyta');
          }
        }
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert(
      'Atsijungti',
      `Nesinchronizuotų taškų: ${offlineStats.unsyncedLocations || 0}\nAr tikrai norite atsijungti?`,
      [
        { text: 'Atšaukti', style: 'cancel' },
        { 
          text: 'Atsijungti', 
          onPress: async () => {
            await stopBackgroundLocation();
            await AuthService.logout();
            await AsyncStorage.clear();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          }
        },
      ]
    );
  };

  const centerOnUser = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion(location, 1000);
    }
  };

  if (loading || !location) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>🌲 Gaunama GPS lokacija...</Text>
        <Text style={styles.loadingSubText}>Miškuose gali užtrukti ilgiau</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        region={location}
        showsUserLocation={true}
        showsMyLocationButton={false}
        mapType="hybrid" // Satellite view for forests
      >
        {/* Nearby users */}
        {users.map((user) => (
          <Marker
            key={user.id}
            coordinate={{
              latitude: user.latitude,
              longitude: user.longitude,
            }}
            title={user.name}
            description={`Paskutinį kartą: ${user.lastSeen}`}
            pinColor="red"
          />
        ))}
        
        {/* User path polyline */}
        {showPath && userPath.length > 1 && (
          <Polyline
            coordinates={userPath.map(point => ({
              latitude: point.latitude,
              longitude: point.longitude,
            }))}
            strokeColor="#007AFF"
            strokeWidth={3}
            strokeOpacity={0.8}
          />
        )}
      </MapView>
      
      {/* Connection status */}
      <View style={[styles.statusBar, !isOnline && styles.statusBarOffline]}>
        <Text style={styles.statusText}>
          {isOnline ? '🌐 Online' : '📶 Offline'} | 
          Kelias: {userPath.length} tšk | 
          Laukia: {offlineStats.unsyncedLocations || 0}
        </Text>
      </View>
      
      {/* Control buttons */}
      <TouchableOpacity style={styles.centerButton} onPress={centerOnUser}>
        <Text style={styles.centerButtonText}>📍</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.pathButton, !showPath && styles.pathButtonDisabled]} 
        onPress={() => setShowPath(!showPath)}
      >
        <Text style={styles.pathButtonText}>
          {showPath ? '🛤️' : '🛤️'}
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.syncButton} 
        onPress={handleSync}
        disabled={!isOnline}
      >
        <Text style={[styles.syncButtonText, !isOnline && styles.buttonDisabled]}>
          ⚡ {offlineStats.unsyncedLocations || 0}
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.clearButton} onPress={handleClearPath}>
        <Text style={styles.clearButtonText}>🗑️</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Atsijungti</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.trackingButton, backgroundTracking && styles.trackingButtonActive]} 
        onPress={backgroundTracking ? stopBackgroundLocation : setupBackgroundLocation}
      >
        <Text style={styles.trackingText}>
          {backgroundTracking ? '🌲 Sekama' : '▶️ Pradėti'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Enhanced styles - užbaigta versija
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  map: {
    width: width,
    height: height,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2c5530',
  },
  loadingText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  loadingSubText: {
    color: '#ccc',
    fontSize: 14,
  },
  statusBar: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: '#34C759',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statusBarOffline: {
    backgroundColor: '#FF9500',
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  centerButton: {
    position: 'absolute',
    bottom: 150,
    right: 20,
    backgroundColor: 'white',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  centerButtonText: {
    fontSize: 20,
  },
  pathButton: {
    position: 'absolute',
    bottom: 210,
    right: 20,
    backgroundColor: '#007AFF',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  pathButtonDisabled: {
    backgroundColor: '#cccccc',
    opacity: 0.6,
  },
  pathButtonText: {
    fontSize: 18,
    color: 'white',
  },
  syncButton: {
    position: 'absolute',
    bottom: 270,
    right: 20,
    backgroundColor: '#FF9500',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  syncButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  clearButton: {
    position: 'absolute',
    bottom: 150,
    left: 20,
    backgroundColor: '#FF3B30',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  clearButtonText: {
    fontSize: 18,
    color: 'white',
  },
  logoutButton: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    backgroundColor: '#8E8E93',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  logoutText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  trackingButton: {
    position: 'absolute',
    bottom: 50,
    right: 20,
    backgroundColor: '#34C759',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  trackingButtonActive: {
    backgroundColor: '#2c5530',
    borderWidth: 2,
    borderColor: '#34C759',
  },
  trackingText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
});