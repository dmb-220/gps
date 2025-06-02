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
import { AuthService } from '../services/AuthService';

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Klaida', 'Prašome užpildyti visus laukus');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Klaida', 'Slaptažodžiai nesutampa');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Klaida', 'Slaptažodis turi būti mažiausiai 6 simbolių');
      return;
    }

    setLoading(true);
    try {
      const response = await AuthService.register(name, email, password);
      if (response.success) {
        Alert.alert(
          'Sėkmė', 
          'Paskyra sukurta sėkmingai!',
          [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
        );
      } else {
        Alert.alert('Klaida', response.message || 'Registracijos klaida');
      }
    } catch (error) {
      Alert.alert('Klaida', 'Nepavyko užregistruoti');
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
        <Text style={styles.title}>Registracija</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Vardas"
          value={name}
          onChangeText={setName}
        />
        
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
        
        <TextInput
          style={styles.input}
          placeholder="Pakartoti slaptažodį"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />
        
        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleRegister}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Registruojamasi...' : 'Registruotis'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.linkButton} 
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.linkText}>Jau turite paskyrą? Prisijunkite</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}