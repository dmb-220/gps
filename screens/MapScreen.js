import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Text,
  Dimensions,
  AppState,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocationService } from '../services/LocationService';
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
      // Send location to API in background
      await LocationService.updateLocationBackground(
        location.coords.latitude,
        location.coords.longitude
      );
      console.log('Background location updated:', location.coords);
    } catch (err) {
      console.error('Failed to update background location:', err);
    }
  }
});

export default function MapScreen({ navigation }) {
  const [location, setLocation] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backgroundTracking, setBackgroundTracking] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    getCurrentLocation();
    fetchUsers();
    setupBackgroundLocation();
    
    // Listen to app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Update location every 20 seconds when app is active
    const locationInterval = setInterval(() => {
      if (appState === 'active') {
        getCurrentLocation();
      }
    }, 20000);

    // Fetch users every 15 seconds when active
    const usersInterval = setInterval(() => {
      if (appState === 'active') {
        fetchUsers();
      }
    }, 15000);

    return () => {
      clearInterval(locationInterval);
      clearInterval(usersInterval);
      subscription?.remove();
    };
  }, []);

  const handleAppStateChange = (nextAppState) => {
    if (appState.match(/inactive|background/) && nextAppState === 'active') {
      console.log('App has come to the foreground!');
      getCurrentLocation();
      fetchUsers();
    }
    setAppState(nextAppState);
  };

  const setupBackgroundLocation = async () => {
    try {
      // Request background location permission
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        Alert.alert('Klaida', 'Reikalingas leidimas naudoti GPS');
        return;
      }

      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        Alert.alert(
          'Background lokacija',
          'Norint sekti lokaciją fone, suteikite "Always" leidimą nustatymuose',
          [
            { text: 'Vėliau', style: 'cancel' },
            { text: 'Nustatymai', onPress: () => Location.enableNetworkProviderAsync() }
          ]
        );
        return;
      }

      // Start balanced background location tracking
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced, // Balanced for better battery life
        timeInterval: 60000, // 60 seconds in background
        distanceInterval: 10, // 10 meters
        deferredUpdatesInterval: 60000,
        showsBackgroundLocationIndicator: true, // iOS indicator
        foregroundService: {
          notificationTitle: 'Location Sharing',
          notificationBody: 'Aktyvus: kas 20s | Fone: kas 60s',
          notificationColor: '#007AFF',
        },
      });

      setBackgroundTracking(true);
      console.log('Background location tracking started (60s interval)');
      
      Alert.alert(
        'Lokacijos sekimas įjungtas',
        '• Kai naudojate aplikaciją: kas 20 sekundžių\n• Fone: kas 60 sekundžių\n\nOptimalus baterijos naudojimas!'
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
      });

      const newLocation = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };

      setLocation(newLocation);
      
      // Send location to API
      await LocationService.updateLocation(
        currentLocation.coords.latitude,
        currentLocation.coords.longitude
      );
      
      setLoading(false);
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Klaida', 'Nepavyko gauti lokacijos');
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await LocationService.getNearbyUsers();
      if (response.success) {
        setUsers(response.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Atsijungti',
      'Ar tikrai norite atsijungti?',
      [
        { text: 'Atšaukti', style: 'cancel' },
        { 
          text: 'Atsijungti', 
          onPress: async () => {
            await stopBackgroundLocation(); // Stop background tracking
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

  const toggleBackgroundTracking = () => {
    if (backgroundTracking) {
      stopBackgroundLocation();
    } else {
      setupBackgroundLocation();
    }
  };

  if (loading || !location) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Gaunama lokacija...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={location}
        showsUserLocation={true}
        showsMyLocationButton={true}
      >
        {users.map((user) => (
          <Marker
            key={user.id}
            coordinate={{
              latitude: user.latitude,
              longitude: user.longitude,
            }}
            title={user.name}
            description={`Paskutinį kartą matytas: ${user.lastSeen}`}
            pinColor="red"
          />
        ))}
      </MapView>
      
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Atsijungti</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.trackingButton, backgroundTracking && styles.trackingButtonActive]} 
        onPress={toggleBackgroundTracking}
      >
        <Text style={styles.trackingText}>
          {backgroundTracking ? 'Stabdyti sekimą' : 'Sekti fone'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}