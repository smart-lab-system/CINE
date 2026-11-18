

class Solution {
    // Function is to check whether two strings are anagram of each other or not.
    public static boolean areAnagrams(String s1, String s2) {

        // Your code here
        if(s1.length() != s2.length()){
            return false;
        }
        for(int i=0; i<s1.length(); i++){
            char ch = s2.charAt(i);
            if(s1.indexOf(ch) == -1){
                return false;
            }
        }
        
        return true;
    }
}