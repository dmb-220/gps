import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  RefreshControl,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GroupService } from '../services/GroupService';

export default function GroupManagementScreen({ navigation }) {
  const [groups, setGroups] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [memberEmail, setMemberEmail] = useState('');

  useEffect(() => {
    loadData();
    checkAdminStatus();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [groupsResult, session, history] = await Promise.all([
        GroupService.getUserGroups(),
        GroupService.getCurrentSession(),
        GroupService.getSessionHistory()
      ]);

      if (groupsResult.success) {
        setGroups(groupsResult.groups);
      }
      
      setCurrentSession(session);
      setSessionHistory(history);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkAdminStatus = async () => {
    try {
      const userRole = await AsyncStorage.getItem('userRole');
      setIsAdmin(userRole === 'admin');
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Klaida', 'Įveskite grupės pavadinimą');
      return;
    }

    const result = await GroupService.createGroup({
      name: newGroupName.trim(),
      description: newGroupDescription.trim(),
      type: 'forest_trip'
    });

    if (result.success) {
      Alert.alert('Sėkmė', result.message);
      setShowCreateModal(false);
      setNewGroupName('');
      setNewGroupDescription('');
      loadData();
    } else {
      Alert.alert('Klaida', result.message);
    }
  };

  const handleStartSession = async (groupId) => {
    Alert.alert(
      'Pradėti sesiją',
      'Ar tikrai norite pradėti miško ėjimo sesiją?',
      [
        { text: 'Atšaukti', style: 'cancel' },
        { 
          text: 'Pradėti', 
          onPress: async () => {
            const result = await GroupService.startGroupSession(groupId);
            if (result.success) {
              Alert.alert('Sėkmė', result.message);
              loadData();
              // Grįžti į žemėlapį
              navigation.navigate('Map');
            } else {
              Alert.alert('Klaida', result.message);
            }
          }
        }
      ]
    );
  };

  const handleEndSession = async () => {
    Alert.alert(
      'Baigti sesiją',
      'Ar tikrai norite baigti aktyvią sesiją? GPS sekimas bus sustabdytas.',
      [
        { text: 'Atšaukti', style: 'cancel' },
        { 
          text: 'Baigti', 
          style: 'destructive',
          onPress: async () => {
            const result = await GroupService.endGroupSession();
            if (result.success) {
              Alert.alert('Sėkmė', result.message);
              loadData();
            } else {
              Alert.alert('Klaida', result.message);
            }
          }
        }
      ]
    );
  };

  const handleAddMember = async () => {
    if (!memberEmail.trim()) {
      Alert.alert('Klaida', 'Įveskite nario el. paštą');
      return;
    }

    const result = await GroupService.addMemberToGroup(selectedGroup.id, memberEmail.trim());
    
    if (result.success) {
      Alert.alert('Sėkmė', result.message);
      setShowAddMemberModal(false);
      setMemberEmail('');
      setSelectedGroup(null);
    } else {
      Alert.alert('Klaida', result.message);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('lt-LT') + ' ' + date.toLocaleTimeString('lt-LT', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatDuration = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end - start;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}min`;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadData} />
        }
      >
        {/* Aktyvi sesija */}
        {currentSession && (
          <View style={styles.activeSessionContainer}>
            <Text style={styles.sectionTitle}>🟢 Aktyvi Sesija</Text>
            <View style={styles.activeSessionCard}>
              <Text style={styles.sessionText}>Grupė: {currentSession.groupName || 'Nežinoma'}</Text>
              <Text style={styles.sessionText}>Pradėta: {formatDate(currentSession.startedAt)}</Text>
              <TouchableOpacity 
                style={styles.endSessionButton} 
                onPress={handleEndSession}
              >
                <Text style={styles.endSessionText}>⏹️ Baigti Sesiją</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Grupės */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🌲 Mano Grupės</Text>
            {isAdmin && (
              <TouchableOpacity 
                style={styles.createButton}
                onPress={() => setShowCreateModal(true)}
              >
                <Text style={styles.createButtonText}>+ Sukurti</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {groups.length === 0 ? (
            <Text style={styles.emptyText}>Nėra grupių</Text>
          ) : (
            groups.map((group) => (
              <View key={group.id} style={styles.groupCard}>
                <Text style={styles.groupName}>{group.name}</Text>
                <Text style={styles.groupDescription}>{group.description}</Text>
                <Text style={styles.groupInfo}>
                  Narių: {group.memberCount || 0} | Sukurta: {formatDate(group.createdAt)}
                </Text>
                
                <View style={styles.groupActions}>
                  <TouchableOpacity 
                    style={styles.startButton}
                    onPress={() => handleStartSession(group.id)}
                    disabled={currentSession !== null}
                  >
                    <Text style={styles.startButtonText}>
                      {currentSession ? '⏸️ Sesija aktyvi' : '▶️ Pradėti'}
                    </Text>
                  </TouchableOpacity>
                  
                  {isAdmin && (
                    <TouchableOpacity 
                      style={styles.addMemberButton}
                      onPress={() => {
                        setSelectedGroup(group);
                        setShowAddMemberModal(true);
                      }}
                    >
                      <Text style={styles.addMemberText}>+ Narys</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        {/* Sesijų istorija */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📈 Sesijų Istorija</Text>
          {sessionHistory.length === 0 ? (
            <Text style={styles.emptyText}>Nėra buvusių sesijų</Text>
          ) : (
            sessionHistory.map((session, index) => (
              <View key={index} style={styles.historyCard}>
                <Text style={styles.historyTitle}>
                  {session.groupName || `Grupė #${session.groupId}`}
                </Text>
                <Text style={styles.historyDate}>
                  {formatDate(session.startedAt)}
                </Text>
                {session.endedAt && (
                  <Text style={styles.historyDuration}>
                    Trukmė: {formatDuration(session.startedAt, session.endedAt)}
                  </Text>
                )}
                <Text style={styles.historyStatus}>
                  Status: {session.status === 'completed' ? '✅ Baigta' : '🟡 Aktyvus'}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Sukurti grupės modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Sukurti Naują Grupę</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Grupės pavadinimas"
              value={newGroupName}
              onChangeText={setNewGroupName}
            />
            
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Aprašymas (neprivaloma)"
              value={newGroupDescription}
              onChangeText={setNewGroupDescription}
              multiline={true}
              numberOfLines={3}
            />
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => {
                  setShowCreateModal(false);
                  setNewGroupName('');
                  setNewGroupDescription('');
                }}
              >
                <Text style={styles.cancelButtonText}>Atšaukti</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.confirmButton}
                onPress={handleCreateGroup}
              >
                <Text style={styles.confirmButtonText}>Sukurti</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pridėti narį modal */}
      <Modal
        visible={showAddMemberModal}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Pridėti Narį</Text>
            <Text style={styles.modalSubtitle}>
              Grupė: {selectedGroup?.name}
            </Text>
            
            <TextInput
              style={styles.input}
              placeholder="Nario el. paštas"
              value={memberEmail}
              onChangeText={setMemberEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => {
                  setShowAddMemberModal(false);
                  setMemberEmail('');
                  setSelectedGroup(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Atšaukti</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.confirmButton}
                onPress={handleAddMember}
              >
                <Text style={styles.confirmButtonText}>Pridėti</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  activeSessionContainer: {
    backgroundColor: '#d4edda',
    margin: 15,
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#28a745',
  },
  activeSessionCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  sessionText: {
    fontSize: 14,
    marginBottom: 5,
    color: '#333',
  },
  endSessionButton: {
    backgroundColor: '#dc3545',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
    alignItems: 'center',
  },
  endSessionText: {
    color: 'white',
    fontWeight: 'bold',
  },
  section: {
    margin: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  createButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  createButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
    marginVertical: 20,
  },
  groupCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  groupName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  groupDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  groupInfo: {
    fontSize: 12,
    color: '#888',
    marginBottom: 10,
  },
  groupActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  startButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  addMemberButton: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 5,
  },
  addMemberText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  historyCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  historyDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3,
  },
  historyDuration: {
    fontSize: 14,
    color: '#007bff',
    marginBottom: 3,
  },
  historyStatus: {
    fontSize: 14,
    color: '#28a745',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 15,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  cancelButton: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  confirmButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 1,
    marginLeft: 10,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});