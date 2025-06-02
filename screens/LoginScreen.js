import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthService } from '../services/AuthService';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Klaida', 'Prašome užpildyti visus laukus');
      return;
    }

    setLoading(true);
    try {
      const response = await AuthService.login(email, password);
      if (response.success) {
        await AsyncStorage.setItem('userToken', response.token);
        await AsyncStorage.setItem('userId', response.userId.toString());
        navigation.reset({
          index: 0,
          routes: [{ name: 'Map' }],
        });
      } else {
        Alert.alert('Klaida', response.message || 'Prisijungimo klaida');
      }
    } catch (error) {
      Alert.alert('Klaida', 'Nepavyko prisijungti');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.formContainer}>
        <Text style={styles.title}>Prisijungimas</Text>
        
        <TextInput
          style={styles.input}
          placeholder="El. paštas"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        
        <TextInput
          style={styles.input}
          placeholder="Slaptažodis"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        
        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Prisijungiama...' : 'Prisijungti'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.linkButton} 
          onPress={() => navigation.navigate('Register')}
        >
          <Text style={styles.linkText}>Neturite paskyros? Registruokitės</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}