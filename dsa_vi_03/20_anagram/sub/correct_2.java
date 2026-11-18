

class Solution {
    // Function is to check whether two strings are anagram of each other or not.
    public static boolean areAnagrams(String s1, String s2) {
        if(s1.length() == 1 && s2.length() == 1) return true;
        if(s1.length() != s2.length()) return false;
        int count[] = new int[256];
        for(int i = 0; i < s1.length(); i++){
            count[s1.charAt(i) - 'a']++;
            count[s2.charAt(i) - 'a']--;
        }
        for(int i = 0; i < 256; i++){
            if(count[i] != 0){
                return false;
            }
        }
        return true;
        
        
        
        
    }
}