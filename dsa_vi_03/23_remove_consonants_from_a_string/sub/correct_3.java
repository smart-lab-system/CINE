

//User function Template for Java

class Solution
{
    public String removeConsonants(String s)
    {
        StringBuilder sb = new StringBuilder();
        String str = "aeiouAEIOU";
        for(int i = 0; i < s.length(); i++){
            for(int j = 0; j < str.length(); j++){
                if(s.charAt(i) == str.charAt(j)){
                    sb.append(s.charAt(i));
                }
                
            }
        }
        if(sb.length() == 0){
            return "No Vowel";
        }
        return sb.toString();
    }
    
}