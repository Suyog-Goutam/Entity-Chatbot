import { collection, doc, addDoc, query, orderBy, serverTimestamp, updateDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

export interface ChatMessage {
  id: string;
  role: 'user' | 'entity';
  content: string;
  createdAt: any;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: any;
}

// Create a new conversation
export const createConversation = async (firstMessage: string): Promise<string> => {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return 'guest_session';

  const title = firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage;
  
  const convRef = await addDoc(collection(db, 'users', user.uid, 'conversations'), {
    title,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });

  return convRef.id;
};

// Delete a conversation
export const deleteConversation = async (conversationId: string) => {
  const user = auth.currentUser;
  if (!user || user.isAnonymous || conversationId === 'guest_session') return;

  const convRef = doc(db, 'users', user.uid, 'conversations', conversationId);
  await deleteDoc(convRef);
};

// Add a message to a conversation
export const addMessageToDb = async (conversationId: string, role: 'user' | 'entity', content: string) => {
  const user = auth.currentUser;
  if (!user || user.isAnonymous || conversationId === 'guest_session') return;

  const msgRef = collection(db, 'users', user.uid, 'conversations', conversationId, 'messages');
  await addDoc(msgRef, {
    role,
    content,
    createdAt: serverTimestamp(),
  });

  // Update conversation updatedAt
  const convRef = doc(db, 'users', user.uid, 'conversations', conversationId);
  await updateDoc(convRef, {
    updatedAt: serverTimestamp()
  });
};

// Get all conversations for the user
export const getConversations = async (): Promise<Conversation[]> => {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return [];

  const q = query(
    collection(db, 'users', user.uid, 'conversations'),
    orderBy('updatedAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Conversation[];
};

// Get all messages for a specific conversation
export const getMessages = async (conversationId: string): Promise<ChatMessage[]> => {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return [];

  const q = query(
    collection(db, 'users', user.uid, 'conversations', conversationId, 'messages'),
    orderBy('createdAt', 'asc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as ChatMessage[];
};
