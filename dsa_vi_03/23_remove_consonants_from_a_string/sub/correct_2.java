

//User function Template for Java




class Solution {
    public String removeConsonants(String s) {
        StringBuilder b = new StringBuilder();
        
        // Iterate through each character of the string
        for (int i = 0; i < s.length(); i++) {
            // Check if the current character is a vowel (both uppercase and lowercase)
            if (isVowel(s.charAt(i))) {
                b.append(s.charAt(i));
            }
        }
        if(b.length()==0)
        {
        	return "No Vowel";
        }
        
        return b.toString();
    }

    // Helper method to check if a character is a vowel
    private boolean isVowel(char c) {
        return c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u' ||
               c == 'A' || c == 'E' || c == 'I' || c == 'O' || c == 'U';
    }
}