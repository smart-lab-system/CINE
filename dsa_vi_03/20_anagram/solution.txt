// Java Code to check if two Strings are anagram of 
// each other using Frequency Array

class Solution {

    // As the input strings can only have lowercase 
    // characters, the maximum characters will be 26
    static final int MAX_CHAR = 26;

    static boolean areAnagrams(String s1, String s2) {
        int[] freq = new int[MAX_CHAR];

        // Count frequency of each character in string s1
        for (int i = 0; i < s1.length(); i++)
            freq[s1.charAt(i) - 'a']++;

        // Count frequency of each character in string s2
        for (int i = 0; i < s2.length(); i++)
            freq[s2.charAt(i) - 'a']--;

        // Check if all frequencies are zero
        for (int count : freq) {
            if (count != 0)
                return false;
        }

        return true;
    }


}